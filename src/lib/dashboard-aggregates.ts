/**
 * Dashboard analytics keyed by electoral_area_id + canonical position (7 fixed roles per electoral area).
 */

import {
  CANONICAL_DELEGATE_POSITIONS,
  canonicalizeDelegatePosition,
} from '@/lib/delegate-positions';

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
  electoralAreaCode: string;
  position: string;
  candidateCount: number;
}

/** One row in electoral roll for slot reporting */
export interface ElectoralAreaBrief {
  id: string;
  name: string;
  code: string;
}

export type SlotState = 'vacant' | 'filled' | 'contested';

export interface DashboardAggregates {
  totalDelegates: number;
  approvedCount: number;
  rejectedCount: number;
  issuedOutstanding: number;
  returnedCount: number;
  returnRatePct: number;
  verifiedCount: number;
  verificationRatePct: number;
  /** Canonical electoral area × position pairs with ≥2 delegates */
  contestedSlots: number;
  /** Canonical pairs with exactly one delegate */
  unopposedSlots: number;
  /** Canonical pairs with zero delegates */
  vacantSlots: number;
  /** Electoral areas included in the current filter scope */
  electoralAreasInScope: number;
  /** Areas in scope × 7 positions */
  canonicalLogicalSlots: number;
  newDelegateCount: number;
  oldDelegateCount: number;
  verificationPending: number;
  verificationVerified: number;
  verificationRejected: number;
  byElectoralArea: { areaName: string; count: number }[];
  contestHighlights: ContestHighlightRow[];
  /** Counts grouped by Candidate.status */
  byStatus: { label: string; count: number }[];
  byDelegateType: { label: string; count: number }[];
  byContestStatus: { label: string; count: number }[];
  delegatesOnCanonicalSlotGrid: number;
  delegatesExcludedFromCanonicalGrid: number;
}

export interface ElectoralAreaSlotReportRow {
  id: string;
  name: string;
  code: string;
  vacantOfSeven: number;
  contestedOfSeven: number;
  filledOfSeven: number;
  slots: { position: string; occupancy: number; slotState: SlotState }[];
}

const RETURNED_STATUSES = new Set(['IMPORTED', 'VETTED', 'APPROVED', 'REJECTED']);

function toSortedCounts(map: Map<string, number>): { label: string; count: number }[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** @deprecated Prefer electoral area slot keys; kept for rare call sites that still key by station code. */
export function makeSlotKey(pollingStationCode: string | null | undefined, position: string | undefined): string | null {
  const code = (pollingStationCode ?? '').trim();
  if (!code) return null;
  const canonPos = canonicalizeDelegatePosition(position ?? '');
  if (!canonPos) return null;
  return `${code}${SLOT_SEP}${canonPos}`;
}

export function makeElectoralAreaSlotKey(
  electoralAreaId: string | null | undefined,
  position: string | undefined,
): string | null {
  const id = (electoralAreaId ?? '').trim();
  if (!id) return null;
  const canonPos = canonicalizeDelegatePosition(position ?? '');
  if (!canonPos) return null;
  return `${id}${SLOT_SEP}${canonPos}`;
}

/** Build occupants map: `${electoralAreaId}|${canonicalPos}` → delegate rows */
function buildCanonicalOccupancyForElectoralAreas(
  rows: DashboardCandidateInput[],
  areaIdsInScope: Set<string>,
): { occupancy: Map<string, DashboardCandidateInput[]>; delegatesExcludedFromCanonicalGrid: number } {
  const occupancy = new Map<string, DashboardCandidateInput[]>();
  let delegatesExcludedFromCanonicalGrid = 0;

  for (const r of rows) {
    const areaId = (r.electoralAreaId ?? '').trim();
    const canonPos = canonicalizeDelegatePosition(r.position);
    if (!areaId || !canonPos) {
      delegatesExcludedFromCanonicalGrid += 1;
      continue;
    }
    if (!areaIdsInScope.has(areaId)) {
      delegatesExcludedFromCanonicalGrid += 1;
      continue;
    }
    const key = `${areaId}${SLOT_SEP}${canonPos}`;
    const list = occupancy.get(key);
    if (list) list.push(r);
    else occupancy.set(key, [r]);
  }

  return { occupancy, delegatesExcludedFromCanonicalGrid };
}

/** Sum delegate rows occupying at least one canonical slot */
function countDelegatesOnGrid(occupancy: Map<string, DashboardCandidateInput[]>): number {
  let sum = 0;
  occupancy.forEach((list) => {
    sum += list.length;
  });
  return sum;
}

function computeElectoralAreaSlotRollup(
  electoralAreas: ElectoralAreaBrief[],
  occupancy: Map<string, DashboardCandidateInput[]>,
): {
  contestedSlots: number;
  unopposedSlots: number;
  vacantSlots: number;
  canonicalLogicalSlots: number;
  contestHighlights: ContestHighlightRow[];
} {
  let contestedSlots = 0;
  let unopposedSlots = 0;
  let vacantSlots = 0;
  const contestHighlights: ContestHighlightRow[] = [];
  const canonicalLogicalSlots = electoralAreas.length * CANONICAL_DELEGATE_POSITIONS.length;

  for (const area of electoralAreas) {
    for (const pos of CANONICAL_DELEGATE_POSITIONS) {
      const key = `${area.id}${SLOT_SEP}${pos}`;
      const list = occupancy.get(key);
      const n = list?.length ?? 0;
      if (n > 1) {
        contestedSlots += 1;
        const sample = list![0];
        contestHighlights.push({
          electoralAreaName: sample.electoralAreaName ?? area.name,
          electoralAreaCode: area.code.trim(),
          position: pos,
          candidateCount: n,
        });
      } else if (n === 1) {
        unopposedSlots += 1;
      } else {
        vacantSlots += 1;
      }
    }
  }

  contestHighlights.sort(
    (a, b) => b.candidateCount - a.candidateCount || a.electoralAreaCode.localeCompare(b.electoralAreaCode),
  );

  return { contestedSlots, unopposedSlots, vacantSlots, canonicalLogicalSlots, contestHighlights };
}

export function buildElectoralAreaCanonicalSlotReports(
  rows: DashboardCandidateInput[],
  electoralAreas: ElectoralAreaBrief[],
): {
  totals: {
    vacantSlots: number;
    contestedSlots: number;
    unopposedSlots: number;
    canonicalLogicalSlots: number;
    electoralAreaCount: number;
  };
  areas: ElectoralAreaSlotReportRow[];
} {
  const areaIds = new Set(electoralAreas.map((a) => a.id));
  const { occupancy } = buildCanonicalOccupancyForElectoralAreas(rows, areaIds);
  const { contestedSlots, unopposedSlots, vacantSlots, canonicalLogicalSlots } =
    computeElectoralAreaSlotRollup(electoralAreas, occupancy);

  const areasOut: ElectoralAreaSlotReportRow[] = electoralAreas.map((area) => {
    let vacantOfSeven = 0;
    let contestedOfSeven = 0;
    let filledOfSeven = 0;
    const slots: ElectoralAreaSlotReportRow['slots'] = [];

    for (const pos of CANONICAL_DELEGATE_POSITIONS) {
      const key = `${area.id}${SLOT_SEP}${pos}`;
      const list = occupancy.get(key);
      const n = list?.length ?? 0;
      let slotState: SlotState = 'vacant';
      if (n > 1) {
        slotState = 'contested';
        contestedOfSeven += 1;
      } else if (n === 1) {
        slotState = 'filled';
        filledOfSeven += 1;
      } else {
        vacantOfSeven += 1;
      }
      slots.push({ position: pos, occupancy: n, slotState });
    }

    return {
      id: area.id,
      name: area.name,
      code: area.code,
      vacantOfSeven,
      contestedOfSeven,
      filledOfSeven,
      slots,
    };
  });

  areasOut.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));

  return {
    totals: {
      vacantSlots,
      contestedSlots,
      unopposedSlots,
      canonicalLogicalSlots,
      electoralAreaCount: electoralAreas.length,
    },
    areas: areasOut,
  };
}

export function aggregateDashboardCandidates(
  rows: DashboardCandidateInput[],
  electoralAreas: ElectoralAreaBrief[],
): DashboardAggregates {
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
    (r) => r.verificationStatus !== 'VERIFIED' && r.status !== 'REJECTED',
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

  const areaIds = new Set(electoralAreas.map((a) => a.id));
  const { occupancy, delegatesExcludedFromCanonicalGrid } = buildCanonicalOccupancyForElectoralAreas(rows, areaIds);
  const delegatesOnCanonicalSlotGrid = countDelegatesOnGrid(occupancy);
  const { contestedSlots, unopposedSlots, vacantSlots, canonicalLogicalSlots, contestHighlights } =
    computeElectoralAreaSlotRollup(electoralAreas, occupancy);

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
    electoralAreasInScope: electoralAreas.length,
    canonicalLogicalSlots,
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
    delegatesOnCanonicalSlotGrid,
    delegatesExcludedFromCanonicalGrid,
  };
}
