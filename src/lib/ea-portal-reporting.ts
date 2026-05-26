import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { compareDelegatePositionCsvOrder } from '@/lib/delegate-positions';
import { eaFormStatusLabel } from '@/lib/ea-portal-form-constants';

export type EaReportFilters = {
  electoralAreaId?: string;
  position?: string;
  delegateType?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  contestOnly?: boolean;
  unopposedOnly?: boolean;
};

export function buildFormsReportWhere(
  scope: string[] | null,
  filters: EaReportFilters
): Prisma.EaPortalIssuedFormWhereInput {
  const parts: Prisma.EaPortalIssuedFormWhereInput[] = [];
  if (scope === null) {
    // all
  } else if (scope.length === 0) {
    parts.push({ electoralAreaId: { in: [] } });
  } else {
    parts.push({ electoralAreaId: { in: scope } });
  }

  if (filters.electoralAreaId) parts.push({ electoralAreaId: filters.electoralAreaId });
  if (filters.position) parts.push({ position: filters.position });
  if (filters.delegateType === 'NEW' || filters.delegateType === 'OLD') {
    parts.push({ delegateType: filters.delegateType });
  }
  if (filters.status) {
    const st = filters.status === 'PENDING' ? 'PENDING_VETTING' : filters.status;
    parts.push({ status: st });
  }

  if (filters.from || filters.to) {
    const issuedAt: { gte?: Date; lte?: Date } = {};
    if (filters.from) issuedAt.gte = new Date(filters.from);
    if (filters.to) {
      const end = new Date(filters.to);
      end.setHours(23, 59, 59, 999);
      issuedAt.lte = end;
    }
    parts.push({ issuedAt });
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    parts.push({
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { surname: { contains: q, mode: 'insensitive' } },
        { middleName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { formNumber: { contains: q, mode: 'insensitive' } },
        { voterId: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { comment: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

type SlotKey = string;

function slotKey(electoralAreaId: string, position: string): SlotKey {
  return `${electoralAreaId}\t${position}`;
}

export async function buildEaPortalReportPayload(scope: string[] | null, filters: EaReportFilters) {
  const where = buildFormsReportWhere(scope, filters);

  const forms = await prisma.eaPortalIssuedForm.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    include: {
      electoralArea: { select: { id: true, name: true, region: true } },
    },
  });

  const slotCounts = new Map<SlotKey, number>();
  const slotMeta = new Map<SlotKey, { areaId: string; areaName: string; region: string; position: string }>();

  const statusCounts = new Map<string, number>();
  const positionCounts = new Map<string, number>();
  const areaMap = new Map<
    string,
    {
      areaId: string;
      areaName: string;
      region: string;
      issued: number;
      returned: number;
      verified: number;
      rejected: number;
      pending: number;
      total: number;
    }
  >();

  let newDelegates = 0;
  let oldDelegates = 0;

  for (const f of forms) {
    const sk = slotKey(f.electoralAreaId, f.position);
    slotCounts.set(sk, (slotCounts.get(sk) ?? 0) + 1);
    if (!slotMeta.has(sk)) {
      slotMeta.set(sk, {
        areaId: f.electoralAreaId,
        areaName: f.electoralArea.name,
        region: f.electoralArea.region,
        position: f.position,
      });
    }

    const st = f.status === 'PENDING' ? 'PENDING_VETTING' : f.status;
    statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1);
    positionCounts.set(f.position, (positionCounts.get(f.position) ?? 0) + 1);

    if (f.delegateType === 'NEW') newDelegates++;
    else if (f.delegateType === 'OLD') oldDelegates++;

    const id = f.electoralAreaId;
    if (!areaMap.has(id)) {
      areaMap.set(id, {
        areaId: id,
        areaName: f.electoralArea.name,
        region: f.electoralArea.region,
        issued: 0,
        returned: 0,
        verified: 0,
        rejected: 0,
        pending: 0,
        total: 0,
      });
    }
    const a = areaMap.get(id)!;
    a.total++;
    if (st === 'RETURNED') a.returned++;
    else if (st === 'VERIFIED') a.verified++;
    else if (st === 'REJECTED') a.rejected++;
    else if (st === 'PENDING_VETTING') a.pending++;
    else if (st === 'ISSUED') a.issued++;
  }

  const contestKeys = new Set<SlotKey>();
  const unopposedKeys = new Set<SlotKey>();
  const contestsByArea = new Map<string, number>();

  for (const [key, count] of Array.from(slotCounts.entries())) {
    const meta = slotMeta.get(key)!;
    if (count > 1) {
      contestKeys.add(key);
      contestsByArea.set(meta.areaId, (contestsByArea.get(meta.areaId) ?? 0) + 1);
    } else if (count === 1) {
      unopposedKeys.add(key);
    }
  }

  let rows = forms;
  if (filters.contestOnly) {
    rows = forms.filter((f) => contestKeys.has(slotKey(f.electoralAreaId, f.position)));
  } else if (filters.unopposedOnly) {
    rows = forms.filter((f) => unopposedKeys.has(slotKey(f.electoralAreaId, f.position)));
  }

  const total = forms.length;
  const returned = statusCounts.get('RETURNED') ?? 0;
  const verified = statusCounts.get('VERIFIED') ?? 0;
  const rejected = statusCounts.get('REJECTED') ?? 0;
  const pending = statusCounts.get('PENDING_VETTING') ?? 0;
  const issued = statusCounts.get('ISSUED') ?? 0;
  const contests = contestKeys.size;
  const unopposed = unopposedKeys.size;
  const totalSlots = slotCounts.size;
  let contestedDelegateCount = 0;
  let unopposedDelegateCount = 0;
  for (const count of Array.from(slotCounts.values())) {
    if (count > 1) contestedDelegateCount += count;
    else if (count === 1) unopposedDelegateCount += count;
  }

  const decided = verified + rejected;
  const inPipeline = returned + pending;
  const verificationRate = total > 0 ? Math.round((verified / total) * 1000) / 10 : 0;
  const returnRate = total > 0 ? Math.round((returned / total) * 1000) / 10 : 0;
  const completionRate = inPipeline + decided > 0 ? Math.round((decided / (inPipeline + decided)) * 1000) / 10 : 0;
  const contestSlotRate = totalSlots > 0 ? Math.round((contests / totalSlots) * 1000) / 10 : 0;

  const statusOrder = ['ISSUED', 'RETURNED', 'PENDING_VETTING', 'VERIFIED', 'REJECTED'];
  const statusBreakdown = statusOrder
    .map((status) => ({
      status,
      label: eaFormStatusLabel(status),
      count: statusCounts.get(status) ?? 0,
      pct: total > 0 ? Math.round(((statusCounts.get(status) ?? 0) / total) * 1000) / 10 : 0,
    }))
    .filter((x) => x.count > 0);

  const byPosition = Array.from(positionCounts.entries())
    .map(([position, count]) => ({ position, count }))
    .sort((a, b) => compareDelegatePositionCsvOrder(a.position, b.position));

  const contestSlots = Array.from(contestKeys)
    .map((key) => {
      const meta = slotMeta.get(key)!;
      return {
        areaId: meta.areaId,
        areaName: meta.areaName,
        region: meta.region,
        position: meta.position,
        applicants: slotCounts.get(key) ?? 0,
      };
    })
    .sort((a, b) => b.applicants - a.applicants || a.areaName.localeCompare(b.areaName));

  const byArea = Array.from(areaMap.values())
    .map((a) => ({
      ...a,
      contests: contestsByArea.get(a.areaId) ?? 0,
      fillRate: totalSlots > 0 ? Math.round((a.total / Math.max(1, contests + unopposed)) * 100) / 100 : 0,
    }))
    .sort((x, y) => y.total - x.total || x.areaName.localeCompare(y.areaName));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalInScope: total,
      filteredRows: rows.length,
      uniqueSlots: totalSlots,
    },
    summary: {
      totalDelegates: total,
      formsIssued: total,
      returned,
      verified,
      rejected,
      pendingVetting: pending,
      issued,
      contests,
      unopposed,
      contestedDelegateCount,
      unopposedDelegateCount,
      newDelegates,
      oldDelegates,
      verificationRate,
      returnRate,
      completionRate,
      contestSlotRate,
      totalSlots,
    },
    statusBreakdown,
    byPosition,
    contestSlots,
    byArea,
    rows: rows.map((r) => ({
      id: r.id,
      formNumber: r.formNumber,
      fullName: r.fullName,
      phone: r.phone,
      voterId: r.voterId,
      delegateType: r.delegateType,
      position: r.position,
      status: r.status === 'PENDING' ? 'PENDING_VETTING' : r.status,
      issuedAt: r.issuedAt.toISOString(),
      electoralAreaName: r.electoralArea.name,
      electoralAreaId: r.electoralAreaId,
      isContest: contestKeys.has(slotKey(r.electoralAreaId, r.position)),
    })),
    filteredCount: rows.length,
  };
}
