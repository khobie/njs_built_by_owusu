import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { areaFilterForScope, formsVisibleWhere } from '@/lib/ea-portal-access';
import { countContestSlots } from '@/lib/ea-portal-delegate';
import { friendlyDbError } from '@/lib/friendly-db-error';
import { requireEaPortal } from '@/lib/ea-portal-session';

function statusCount(rows: { status: string; _count: { _all: number } }[], ...keys: string[]) {
  return keys.reduce((n, k) => n + (rows.find((x) => x.status === k)?._count._all ?? 0), 0);
}

function activityWhereForScope(scope: string[] | null): Prisma.EaPortalActivityWhereInput | undefined {
  if (scope === null) return undefined;
  if (scope.length === 0) return { id: { in: [] } };
  return {
    OR: [{ areaId: { in: scope } }, { form: { electoralAreaId: { in: scope } } }],
  };
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireEaPortal(request);
    if (!gate.ok) return gate.response;

    const formsBase = formsVisibleWhere(gate.scope);
    const areaWhere = areaFilterForScope(gate.scope);
    const activityWhere = activityWhereForScope(gate.scope);

    const [
      areaCount,
      formsTotal,
      byStatus,
      byDelegateType,
      byArea,
      byPosition,
      recentForms,
      recentActivity,
      contestStats,
    ] = await Promise.all([
      prisma.eaPortalArea.count({ where: areaWhere }),
      prisma.eaPortalIssuedForm.count({ where: formsBase }),
      prisma.eaPortalIssuedForm.groupBy({
        by: ['status'],
        where: formsBase,
        _count: { _all: true },
      }),
      prisma.eaPortalIssuedForm.groupBy({
        by: ['delegateType'],
        where: formsBase,
        _count: { _all: true },
      }),
      prisma.eaPortalArea.findMany({
        where: areaWhere,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          region: true,
          _count: { select: { issuedForms: true } },
        },
      }),
      prisma.eaPortalIssuedForm.groupBy({
        by: ['position'],
        where: formsBase,
        _count: { _all: true },
      }),
      prisma.eaPortalIssuedForm.findMany({
        where: formsBase,
        orderBy: { issuedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          fullName: true,
          position: true,
          formNumber: true,
          status: true,
          delegateType: true,
          issuedAt: true,
          electoralArea: { select: { id: true, name: true } },
          pollingStationName: true,
        },
      }),
      prisma.eaPortalActivity.findMany({
        where: activityWhere,
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          area: { select: { name: true } },
          form: { select: { formNumber: true, fullName: true } },
        },
      }),
      countContestSlots(formsBase),
    ]);

    const issued = statusCount(byStatus, 'ISSUED');
    const returned = statusCount(byStatus, 'RETURNED');
    const pendingVetting = statusCount(byStatus, 'PENDING_VETTING', 'PENDING');
    const verified = statusCount(byStatus, 'VERIFIED');
    const rejected = statusCount(byStatus, 'REJECTED');

    const newDelegates = byDelegateType.find((x) => x.delegateType === 'NEW')?._count._all ?? 0;
    const oldDelegates = byDelegateType.find((x) => x.delegateType === 'OLD')?._count._all ?? 0;

    const verificationRate =
      formsTotal > 0 ? Math.round((verified / formsTotal) * 1000) / 10 : 0;
    const returnRate = formsTotal > 0 ? Math.round((returned / formsTotal) * 1000) / 10 : 0;

    return NextResponse.json({
      totals: {
        electoralAreas: areaCount,
        totalDelegates: formsTotal,
        formsIssued: formsTotal,
        returnedForms: returned,
        pendingVetting,
        verifiedDelegates: verified,
        rejectedDelegates: rejected,
        contests: contestStats.contests,
        unopposedPositions: contestStats.unopposed,
        newDelegates,
        oldDelegates,
        verificationRate,
        returnRate,
      },
      charts: {
        byArea: byArea.map((a) => ({
          areaId: a.id,
          areaName: a.name,
          region: a.region,
          count: a._count.issuedForms,
        })),
        byPosition: byPosition
          .map((p) => ({ position: p.position, count: p._count._all }))
          .sort((a, b) => b.count - a.count),
        delegateType: [
          { type: 'NEW', count: newDelegates },
          { type: 'OLD', count: oldDelegates },
        ],
        vettingProgress: [
          { label: 'Issued', count: issued },
          { label: 'Returned', count: returned },
          { label: 'Pending vetting', count: pendingVetting },
          { label: 'Verified', count: verified },
          { label: 'Rejected', count: rejected },
        ],
      },
      recentForms,
      recentActivity,
    });
  } catch (e) {
    console.error('GET /api/ea-portal/dashboard failed:', e);
    return NextResponse.json({ error: friendlyDbError(e) }, { status: 500 });
  }
}
