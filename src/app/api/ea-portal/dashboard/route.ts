import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordsVisibleWhere, areaFilterForScope, formsVisibleWhere } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { scope } = gate;

  const areaWhere = areaFilterForScope(scope);
  const recordBase = recordsVisibleWhere(scope);
  const formsBase = formsVisibleWhere(scope);

  const [
    areaCount,
    recordCount,
    unassignedCount,
    byArea,
    recentRecords,
    recentActivity,
    formsTotal,
    formsByStatus,
    formPositionGroups,
    formsPerArea,
    recentForms,
  ] = await Promise.all([
      prisma.eaPortalArea.count({ where: areaWhere }),
      prisma.eaPortalRecord.count({ where: recordBase }),
      prisma.eaPortalRecord.count({
        where: {
          AND: [recordBase, { electoralAreaId: null }],
        },
      }),
      prisma.eaPortalArea.findMany({
        where: areaWhere,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          region: true,
          _count: { select: { records: true } },
        },
      }),
      prisma.eaPortalRecord.findMany({
        where: recordBase,
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          fullName: true,
          role: true,
          phone: true,
          createdAt: true,
          electoralArea: { select: { id: true, name: true } },
        },
      }),
      prisma.eaPortalActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          area: { select: { id: true, name: true } },
          record: { select: { id: true, fullName: true } },
        },
      }),
      prisma.eaPortalIssuedForm.count({ where: formsBase }),
      prisma.eaPortalIssuedForm.groupBy({
        by: ['status'],
        where: formsBase,
        _count: { _all: true },
      }),
      prisma.eaPortalIssuedForm.groupBy({
        by: ['electoralAreaId', 'position'],
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
      prisma.eaPortalIssuedForm.findMany({
        where: formsBase,
        orderBy: { issuedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          fullName: true,
          position: true,
          formNumber: true,
          status: true,
          issuedAt: true,
          electoralArea: { select: { id: true, name: true } },
        },
      }),
    ]);

  const statusCount = (s: string) =>
    formsByStatus.find((x) => x.status === s)?._count._all ?? 0;
  const contestSlots = formPositionGroups.filter((g) => g._count._all > 1).length;
  const unopposedSlots = formPositionGroups.filter((g) => g._count._all === 1).length;

  return NextResponse.json({
    totals: {
      electoralAreas: areaCount,
      records: recordCount,
      unassignedRecords: unassignedCount,
      formsIssued: formsTotal,
      formsPending: statusCount('PENDING'),
      formsVerified: statusCount('VERIFIED'),
      formsRejected: statusCount('REJECTED'),
      formContestPositions: contestSlots,
      formUnopposedPositions: unopposedSlots,
    },
    recordsPerArea: byArea.map((a) => ({
      areaId: a.id,
      areaName: a.name,
      region: a.region,
      count: a._count.records,
    })),
    formsPerArea: formsPerArea.map((a) => ({
      areaId: a.id,
      areaName: a.name,
      region: a.region,
      count: a._count.issuedForms,
    })),
    recentForms,
    recentRecords,
    recentActivity,
  });
}
