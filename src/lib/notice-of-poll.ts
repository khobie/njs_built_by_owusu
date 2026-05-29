/**
 * Notice of Poll — server-side data builder.
 *
 * Operates on EA Portal forms (`EaPortalIssuedForm`) ONLY. Contest status is
 * determined exclusively from VERIFIED (approved) applicants per electoral area
 * × position: rejected / pending / absent applicants are never counted when
 * deciding contested vs unopposed.
 */
import { prisma } from '@/lib/prisma';
import { formsVisibleWhere } from '@/lib/ea-portal-access';
import { normalizeEaFormStatus } from '@/lib/ea-portal-delegate';
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
  approvalLabel,
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

function normalizePosition(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

function slotKey(electoralAreaId: string, position: string): string {
  return `${electoralAreaId}::${normalizePosition(position)}`;
}

type FormForNotice = {
  id: string;
  formNumber: string;
  fullName: string;
  phone: string;
  position: string;
  status: string;
  comment: string | null;
  vettingNotes: string | null;
  electoralAreaId: string;
  electoralArea: { name: string; region: string } | null;
};

/**
 * Builds the Notice of Poll payload from EA Portal forms.
 *
 * @param scope `null` = all areas; string[] = restrict to those EaPortalArea ids.
 * @param filters row-level filters (do not affect contest grouping for area/position scope).
 */
export async function buildNoticeOfPollData(
  scope: string[] | null,
  filters: NoticeOfPollFilters
): Promise<NoticeOfPollPayload> {
  const baseAnd: Record<string, unknown>[] = [];

  const visible = formsVisibleWhere(scope);
  if (Object.keys(visible).length > 0) baseAnd.push(visible as Record<string, unknown>);
  if (filters.areaIds?.length) baseAnd.push({ electoralAreaId: { in: filters.areaIds } });
  if (filters.position) baseAnd.push({ position: filters.position });

  const base = (await prisma.eaPortalIssuedForm.findMany({
    where: baseAnd.length ? { AND: baseAnd } : {},
    select: {
      id: true,
      formNumber: true,
      fullName: true,
      phone: true,
      position: true,
      status: true,
      comment: true,
      vettingNotes: true,
      electoralAreaId: true,
      electoralArea: { select: { name: true, region: true } },
    },
    orderBy: { issuedAt: 'desc' },
  })) as FormForNotice[];

  const rowsBase = base.map((f) => ({ ...f, status: normalizeEaFormStatus(f.status) }));

  // Verified (approved) counts per slot → contest determination (approved only).
  const verifiedBySlot = new Map<string, number>();
  for (const f of rowsBase) {
    if (f.status !== 'VERIFIED') continue;
    const key = slotKey(f.electoralAreaId, f.position);
    verifiedBySlot.set(key, (verifiedBySlot.get(key) ?? 0) + 1);
  }

  let contestedPositions = 0;
  let unopposedPositions = 0;
  for (const count of Array.from(verifiedBySlot.values())) {
    if (count > 1) contestedPositions += 1;
    else if (count === 1) unopposedPositions += 1;
  }

  const summary: NoticeOfPollSummary = {
    totalApplicants: rowsBase.length,
    totalApproved: rowsBase.filter((f) => f.status === 'VERIFIED').length,
    totalDisqualified: rowsBase.filter((f) => f.status === 'REJECTED').length,
    contestedPositions,
    unopposedPositions,
    didNotAppear: rowsBase.filter((f) => f.status !== 'VERIFIED' && f.status !== 'REJECTED').length,
  };

  const q = filters.q?.trim().toLowerCase();

  const rows: NoticeOfPollRow[] = rowsBase
    .map((f) => {
      const verifiedInSlot = verifiedBySlot.get(slotKey(f.electoralAreaId, f.position)) ?? 0;
      const contest: RowContestStatus =
        f.status === 'VERIFIED' ? (verifiedInSlot > 1 ? 'CONTESTED' : 'UNOPPOSED') : 'NONE';
      return {
        id: f.id,
        formNumber: f.formNumber,
        applicantName: f.fullName,
        phone: f.phone,
        electoralAreaId: f.electoralAreaId,
        electoralAreaName: f.electoralArea?.name ?? '—',
        electoralAreaRegion: f.electoralArea?.region ?? '',
        position: f.position,
        status: f.status,
        contestStatus: contest,
        disqualificationReason:
          f.status === 'REJECTED' ? f.comment?.trim() || f.vettingNotes?.trim() || null : null,
        finalEligibility: deriveFinalEligibility(f.status, contest),
      };
    })
    .filter((row) => {
      if (filters.approvedOnly && row.status !== 'VERIFIED') return false;
      if (filters.disqualifiedOnly && row.status !== 'REJECTED') return false;
      if (filters.status && row.status !== normalizeEaFormStatus(filters.status)) return false;
      if (filters.contestStatus) {
        if (filters.contestStatus === 'CONTESTED' && row.contestStatus !== 'CONTESTED') return false;
        if (filters.contestStatus === 'UNOPPOSED' && row.contestStatus !== 'UNOPPOSED') return false;
      }
      if (q) {
        const hay = `${row.applicantName} ${row.formNumber} ${row.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const areaCmp = a.electoralAreaName.localeCompare(b.electoralAreaName);
      if (areaCmp !== 0) return areaCmp;
      const posCmp = a.position.localeCompare(b.position);
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
