import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordsVisibleWhere, areaFilterForScope } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { scope } = gate;

  const areaWhere = areaFilterForScope(scope);
  const recordBase = recordsVisibleWhere(scope);

  const [areaCount, recordCount, unassignedCount, byArea, recentRecords, recentActivity] =
    await Promise.all([
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
    ]);

  return NextResponse.json({
    totals: {
      electoralAreas: areaCount,
      records: recordCount,
      unassignedRecords: unassignedCount,
    },
    recordsPerArea: byArea.map((a) => ({
      areaId: a.id,
      areaName: a.name,
      region: a.region,
      count: a._count.records,
    })),
    recentRecords,
    recentActivity,
  });
}
