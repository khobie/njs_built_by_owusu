/**
 * Dashboard analytics keyed strictly by polling_station_code + position (never by station name).
 * Rows without a non-empty polling_station_code are excluded from contest / unopposed slot logic.
 */

export const SLOT_SEP = '\u0001';

export interface DashboardCandidateInput {
  id: string;
  pollingStationCode: string | null;
  position: string;
  delegateType: string;
  status: string;
  verificationStatus: string;
  contestStatus: string;
  electoralAreaId: string;
  electoralAreaName: string;
  /** Display only — never used for grouping */
  pollingStationName: string | null;
}

export interface ContestHighlightRow {
  electoralAreaName: string;
  pollingStationName: string;
  pollingStationCode: string;
  position: string;
  candidateCount: number;
}

export interface DashboardAggregates {
  totalDelegates: number;
  approvedCount: number;
  rejectedCount: number;
  issuedOutstanding: number;
  returnedCount: number;
  returnRatePct: number;
  verifiedCount: number;
  verificationRatePct: number;
  /** Distinct (code+position) slots with >1 delegate */
  contestedSlots: number;
  /** Distinct (code+position) slots with exactly 1 delegate */
  unopposedSlots: number;
  /** Always 0 with current aggregation (slots only exist when ≥1 delegate) */
  vacantSlots: number;
  newDelegateCount: number;
  oldDelegateCount: number;
  verificationPending: number;
  verificationVerified: number;
  verificationRejected: number;
  byElectoralArea: { areaName: string; count: number }[];
  contestHighlights: ContestHighlightRow[];
  /** Counts grouped by Candidate.status — sums to totalDelegates */
  byStatus: { label: string; count: number }[];
  /** Counts grouped by Candidate.delegateType — sums to totalDelegates */
  byDelegateType: { label: string; count: number }[];
  /** Counts grouped by Candidate.contestStatus — sums to totalDelegates */
  byContestStatus: { label: string; count: number }[];
  /** Rows with polling code + position (included in contested/unopposed slot logic) */
  delegatesInSlotAnalysis: number;
  /** Rows missing code or position (slot chart/slot totals ignore these rows) */
  delegatesExcludedFromSlotAnalysis: number;
}

const RETURNED_STATUSES = new Set(['IMPORTED', 'VETTED', 'APPROVED', 'REJECTED']);

function toSortedCounts(map: Map<string, number>): { label: string; count: number }[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function makeSlotKey(pollingStationCode: string | null | undefined, position: string | undefined): string | null {
  const code = (pollingStationCode ?? '').trim();
  const pos = (position ?? '').trim();
  if (!code || !pos) return null;
  return `${code}${SLOT_SEP}${pos}`;
}

export function aggregateDashboardCandidates(rows: DashboardCandidateInput[]): DashboardAggregates {
  const totalDelegates = rows.length;

  const issuedOutstanding = rows.filter((r) => r.status === 'ISSUED').length;
  const approvedCount = rows.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = rows.filter((r) => r.status === 'REJECTED').length;
  const returnedCount = rows.filter((r) => RETURNED_STATUSES.has(r.status)).length;
  const denomReturn = totalDelegates > 0 ? totalDelegates : 0;
  const returnRatePct = denomReturn > 0 ? (returnedCount / denomReturn) * 100 : 0;

  const verifiedCount = rows.filter((r) => r.verificationStatus === 'VERIFIED').length;
  const verificationRatePct = totalDelegates > 0 ? (verifiedCount / totalDelegates) * 100 : 0;

  const verificationRejected = rows.filter((r) => r.status === 'REJECTED').length;
  const verificationVerified = rows.filter((r) => r.verificationStatus === 'VERIFIED').length;
  const verificationPending = rows.filter(
    (r) => r.verificationStatus !== 'VERIFIED' && r.status !== 'REJECTED'
  ).length;

  const newDelegateCount = rows.filter((r) => r.delegateType === 'NEW').length;
  const oldDelegateCount = rows.filter((r) => r.delegateType === 'OLD').length;

  const statusMap = new Map<string, number>();
  const delegateTypeMap = new Map<string, number>();
  const contestStatusMap = new Map<string, number>();
  for (const r of rows) {
    const st = r.status.trim() || 'UNKNOWN';
    statusMap.set(st, (statusMap.get(st) ?? 0) + 1);
    const dt = r.delegateType.trim() || 'UNKNOWN';
    delegateTypeMap.set(dt, (delegateTypeMap.get(dt) ?? 0) + 1);
    const cs = r.contestStatus.trim() || 'UNKNOWN';
    contestStatusMap.set(cs, (contestStatusMap.get(cs) ?? 0) + 1);
  }

  const delegatesInSlotAnalysis = rows.filter((r) => makeSlotKey(r.pollingStationCode, r.position) !== null).length;
  const delegatesExcludedFromSlotAnalysis = totalDelegates - delegatesInSlotAnalysis;

  const slotMap = new Map<string, DashboardCandidateInput[]>();
  for (const r of rows) {
    const key = makeSlotKey(r.pollingStationCode, r.position);
    if (!key) continue;
    const list = slotMap.get(key);
    if (list) list.push(r);
    else slotMap.set(key, [r]);
  }

  let contestedSlots = 0;
  let unopposedSlots = 0;
  let vacantSlots = 0;
  const contestHighlights: ContestHighlightRow[] = [];

  slotMap.forEach((list) => {
    const n = list.length;
    if (n > 1) {
      contestedSlots += 1;
      const sample = list[0];
      contestHighlights.push({
        electoralAreaName: sample.electoralAreaName,
        pollingStationName: sample.pollingStationName ?? '—',
        pollingStationCode: (sample.pollingStationCode ?? '').trim(),
        position: sample.position,
        candidateCount: n,
      });
    } else if (n === 1) {
      unopposedSlots += 1;
    } else {
      vacantSlots += 1;
    }
  });

  contestHighlights.sort((a, b) => b.candidateCount - a.candidateCount || a.pollingStationCode.localeCompare(b.pollingStationCode));

  const areaCounts = new Map<string, number>();
  for (const r of rows) {
    const name = r.electoralAreaName || 'Unknown';
    areaCounts.set(name, (areaCounts.get(name) ?? 0) + 1);
  }
  const byElectoralArea = Array.from(areaCounts.entries())
    .map(([areaName, count]) => ({ areaName, count }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName));

  return {
    totalDelegates,
    approvedCount,
    rejectedCount,
    issuedOutstanding,
    returnedCount,
    returnRatePct,
    verifiedCount,
    verificationRatePct,
    contestedSlots,
    unopposedSlots,
    vacantSlots,
    newDelegateCount,
    oldDelegateCount,
    verificationPending,
    verificationVerified,
    verificationRejected,
    byElectoralArea,
    contestHighlights,
    byStatus: toSortedCounts(statusMap),
    byDelegateType: toSortedCounts(delegateTypeMap),
    byContestStatus: toSortedCounts(contestStatusMap),
    delegatesInSlotAnalysis,
    delegatesExcludedFromSlotAnalysis,
  };
}
