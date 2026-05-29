/**
 * Notice of Poll — server-side data builder for the official poll-notice portal.
 *
 * Built on the polling-station `Candidate` model. Contest status is determined
 * ONLY from APPROVED applicants per electoral area × canonical position, per the
 * electoral rules: rejected / disqualified / absent / not-approved applicants are
 * never counted when deciding contested vs unopposed.
 */
import { prisma } from '@/lib/prisma';
import {
  canonicalizeDelegatePosition,
  compareDelegatePositionCsvOrder,
  normalizeDelegatePosition,
} from '@/lib/delegate-positions';
import {
  deriveFinalEligibility,
  type NoticeOfPollFilters,
  type NoticeOfPollPayload,
  type NoticeOfPollRow,
  type NoticeOfPollSummary,
  type RowContestStatus,
} from '@/lib/notice-of-poll-display';

export {
  NON_ATTENDEE_REASON,
  finalEligibilityLabel,
  rowContestStatusLabel,
} from '@/lib/notice-of-poll-display';
export type {
  NoticeOfPollFilters,
  NoticeOfPollPayload,
  NoticeOfPollRow,
  NoticeOfPollSummary,
  RowContestStatus,
  FinalEligibility,
} from '@/lib/notice-of-poll-display';

/** Statuses that represent a completed vetting decision. */
const DECIDED_STATUSES = new Set(['APPROVED', 'REJECTED']);

function slotKey(electoralAreaId: string, position: string): string {
  const canon = canonicalizeDelegatePosition(position) ?? normalizeDelegatePosition(position);
  return `${electoralAreaId}::${canon}`;
}

type CandidateForNotice = {
  id: string;
  formNumber: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  phoneNumber: string;
  position: string;
  status: string;
  verificationStatus: string;
  comment: string | null;
  electoralAreaId: string;
  electoralArea: { name: string; code: string } | null;
};

function buildName(c: CandidateForNotice): string {
  return [c.surname, c.firstName, c.middleName].filter(Boolean).join(' ').trim() || c.formNumber;
}

/**
 * Builds the Notice of Poll payload.
 *
 * @param areaCodeScope `null` = full access (all areas); array = restrict to those area codes.
 * @param filters row-level filters (do not affect contest grouping for area/position scope).
 */
export async function buildNoticeOfPollData(
  areaCodeScope: string[] | null,
  filters: NoticeOfPollFilters
): Promise<NoticeOfPollPayload> {
  // Base scope: area access + area/position filters. Contest grouping uses this base
  // so it stays correct regardless of status / approved-only / search filters.
  const baseAnd: Record<string, unknown>[] = [];

  if (areaCodeScope !== null) {
    baseAnd.push({
      electoralArea: { code: { in: areaCodeScope.length ? areaCodeScope : ['__none__'] } },
    });
  }
  if (filters.areaIds?.length) {
    baseAnd.push({ electoralAreaId: { in: filters.areaIds } });
  }
  if (filters.position) {
    baseAnd.push({ position: filters.position });
  }

  const base = (await prisma.candidate.findMany({
    where: baseAnd.length ? { AND: baseAnd } : {},
    select: {
      id: true,
      formNumber: true,
      surname: true,
      firstName: true,
      middleName: true,
      phoneNumber: true,
      position: true,
      status: true,
      verificationStatus: true,
      comment: true,
      electoralAreaId: true,
      electoralArea: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  })) as CandidateForNotice[];

  // Approved counts per slot → contest determination (approved only).
  const approvedBySlot = new Map<string, number>();
  for (const c of base) {
    if (c.status !== 'APPROVED') continue;
    const key = slotKey(c.electoralAreaId, c.position);
    approvedBySlot.set(key, (approvedBySlot.get(key) ?? 0) + 1);
  }

  let contestedPositions = 0;
  let unopposedPositions = 0;
  for (const count of Array.from(approvedBySlot.values())) {
    if (count > 1) contestedPositions += 1;
    else if (count === 1) unopposedPositions += 1;
  }

  const summary: NoticeOfPollSummary = {
    totalApplicants: base.length,
    totalApproved: base.filter((c) => c.status === 'APPROVED').length,
    totalDisqualified: base.filter((c) => c.status === 'REJECTED').length,
    contestedPositions,
    unopposedPositions,
    didNotAppear: base.filter((c) => !DECIDED_STATUSES.has(c.status)).length,
  };

  const q = filters.q?.trim().toLowerCase();

  const rows: NoticeOfPollRow[] = base
    .map((c) => {
      const approvedInSlot = approvedBySlot.get(slotKey(c.electoralAreaId, c.position)) ?? 0;
      const contest: RowContestStatus =
        c.status === 'APPROVED'
          ? approvedInSlot > 1
            ? 'CONTESTED'
            : 'UNOPPOSED'
          : 'NONE';
      const canonical = canonicalizeDelegatePosition(c.position);
      return {
        id: c.id,
        formNumber: c.formNumber,
        applicantName: buildName(c),
        phoneNumber: c.phoneNumber,
        electoralAreaId: c.electoralAreaId,
        electoralAreaName: c.electoralArea?.name ?? '—',
        electoralAreaCode: c.electoralArea?.code ?? '',
        position: c.position,
        positionCanonical: canonical,
        vettingStatus: c.verificationStatus,
        approvalStatus: c.status,
        contestStatus: contest,
        disqualificationReason: c.status === 'REJECTED' ? c.comment ?? null : null,
        finalEligibility: deriveFinalEligibility(c.status, contest),
      };
    })
    .filter((row) => {
      if (filters.approvedOnly && row.approvalStatus !== 'APPROVED') return false;
      if (filters.disqualifiedOnly && row.approvalStatus !== 'REJECTED') return false;
      if (filters.status && row.approvalStatus !== filters.status) return false;
      if (filters.contestStatus) {
        if (filters.contestStatus === 'CONTESTED' && row.contestStatus !== 'CONTESTED') return false;
        if (filters.contestStatus === 'UNOPPOSED' && row.contestStatus !== 'UNOPPOSED') return false;
      }
      if (q) {
        const hay = `${row.applicantName} ${row.formNumber} ${row.phoneNumber}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const areaCmp = a.electoralAreaName.localeCompare(b.electoralAreaName);
      if (areaCmp !== 0) return areaCmp;
      const posCmp = compareDelegatePositionCsvOrder(a.position, b.position);
      if (posCmp !== 0) return posCmp;
      return a.applicantName.localeCompare(b.applicantName);
    });

  return {
    generatedAt: new Date().toISOString(),
    summary,
    rows,
    filteredCount: rows.length,
  };
}

export function parseNoticeOfPollFilters(sp: URLSearchParams): NoticeOfPollFilters {
  const areaIds = sp.getAll('areaId').map((v) => v.trim()).filter(Boolean);
  const csv = sp.get('areaIds');
  if (csv) {
    for (const id of csv.split(',').map((v) => v.trim()).filter(Boolean)) {
      if (!areaIds.includes(id)) areaIds.push(id);
    }
  }
  return {
    areaIds: areaIds.length ? areaIds : undefined,
    position: sp.get('position') || undefined,
    contestStatus: sp.get('contestStatus') || undefined,
    status: sp.get('status') || undefined,
    approvedOnly: sp.get('approvedOnly') === '1',
    disqualifiedOnly: sp.get('disqualifiedOnly') === '1',
    q: sp.get('q') || undefined,
  };
}
