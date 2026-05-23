import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { countContestSlots } from '@/lib/ea-portal-delegate';

export type EaReportFilters = {
  electoralAreaId?: string;
  pollingStationCode?: string;
  position?: string;
  delegateType?: string;
  status?: string;
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
  if (filters.pollingStationCode) parts.push({ pollingStationCode: filters.pollingStationCode });
  if (filters.position) parts.push({ position: filters.position });
  if (filters.delegateType === 'NEW' || filters.delegateType === 'OLD') {
    parts.push({ delegateType: filters.delegateType });
  }
  if (filters.status) {
    const st = filters.status === 'PENDING' ? 'PENDING_VETTING' : filters.status;
    parts.push({ status: st });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export async function buildEaPortalReportPayload(
  scope: string[] | null,
  filters: EaReportFilters
) {
  const where = buildFormsReportWhere(scope, filters);

  const forms = await prisma.eaPortalIssuedForm.findMany({
    where,
    include: {
      electoralArea: { select: { id: true, name: true, region: true } },
    },
  });

  let rows = forms;
  const contestStats = await countContestSlots(where);

  if (filters.contestOnly || filters.unopposedOnly) {
    const groups = await prisma.eaPortalIssuedForm.groupBy({
      by: ['electoralAreaId', 'position'],
      where,
      _count: { _all: true },
    });
    const contestKeys = new Set(
      groups.filter((g) => g._count._all > 1).map((g) => `${g.electoralAreaId}\t${g.position}`)
    );
    const unopposedKeys = new Set(
      groups.filter((g) => g._count._all === 1).map((g) => `${g.electoralAreaId}\t${g.position}`)
    );
    rows = forms.filter((r) => {
      const k = `${r.electoralAreaId}\t${r.position}`;
      if (filters.contestOnly) return contestKeys.has(k);
      if (filters.unopposedOnly) return unopposedKeys.has(k);
      return true;
    });
  }

  const total = forms.length;
  const returned = forms.filter((f) => f.status === 'RETURNED').length;
  const verified = forms.filter((f) => f.status === 'VERIFIED').length;
  const rejected = forms.filter((f) => f.status === 'REJECTED').length;
  const pending = forms.filter(
    (f) => f.status === 'PENDING_VETTING' || f.status === 'PENDING'
  ).length;
  const issued = forms.filter((f) => f.status === 'ISSUED').length;
  const newDelegates = forms.filter((f) => f.delegateType === 'NEW').length;
  const oldDelegates = forms.filter((f) => f.delegateType === 'OLD').length;

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

  for (const f of forms) {
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
    if (f.status === 'RETURNED') a.returned++;
    else if (f.status === 'VERIFIED') a.verified++;
    else if (f.status === 'REJECTED') a.rejected++;
    else if (f.status === 'PENDING_VETTING' || f.status === 'PENDING') a.pending++;
    else if (f.status === 'ISSUED') a.issued++;
  }

  const slotContestByArea = new Map<string, number>();
  const groups = await prisma.eaPortalIssuedForm.groupBy({
    by: ['electoralAreaId', 'position'],
    where,
    _count: { _all: true },
  });
  for (const g of groups) {
    if (g._count._all > 1) {
      slotContestByArea.set(
        g.electoralAreaId,
        (slotContestByArea.get(g.electoralAreaId) ?? 0) + 1
      );
    }
  }

  const byArea = Array.from(areaMap.values())
    .map((a) => ({
      ...a,
      contests: slotContestByArea.get(a.areaId) ?? 0,
    }))
    .sort((x, y) => x.areaName.localeCompare(y.areaName));

  return {
    summary: {
      totalDelegates: total,
      formsIssued: total,
      returned,
      verified,
      rejected,
      pendingVetting: pending,
      issued,
      contests: contestStats.contests,
      unopposed: contestStats.unopposed,
      newDelegates,
      oldDelegates,
      verificationRate: total > 0 ? Math.round((verified / total) * 1000) / 10 : 0,
      returnRate: total > 0 ? Math.round((returned / total) * 1000) / 10 : 0,
    },
    byArea,
    rows: rows.map((r) => ({
      id: r.id,
      formNumber: r.formNumber,
      fullName: r.fullName,
      phone: r.phone,
      delegateType: r.delegateType,
      position: r.position,
      status: r.status,
      pollingStationName: r.pollingStationName,
      electoralAreaName: r.electoralArea.name,
    })),
    filteredCount: rows.length,
  };
}
