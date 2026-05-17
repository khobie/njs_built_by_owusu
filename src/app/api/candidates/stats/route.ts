import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  aggregateDashboardCandidates,
  type DashboardCandidateInput,
  type ElectoralAreaBrief,
} from '@/lib/dashboard-aggregates';
import { canonicalizeDelegatePosition } from '@/lib/delegate-positions';

export async function GET() {
  try {
    const [
      importedCount,
      vettedCount,
      newCount,
      oldCount,
      totalReports,
      unresolvedReports,
      verifiedCount,
      unverifiedCount,
      approvedCount,
      rejectedCount,
      electoralAreasRaw,
      candidates,
      byElectoralArea,
      totalCandidates,
      totalElectoralAreas,
      totalPollingStations,
    ] = await Promise.all([
      prisma.candidate.count({ where: { status: 'IMPORTED' } }),
      prisma.candidate.count({ where: { status: 'VETTED' } }),
      prisma.candidate.count({ where: { delegateType: 'NEW' } }),
      prisma.candidate.count({ where: { delegateType: 'OLD' } }),
      prisma.candidateReport.count(),
      prisma.candidateReport.count({ where: { isResolved: false } }),
      prisma.candidate.count({ where: { verificationStatus: 'VERIFIED' } }),
      prisma.candidate.count({ where: { verificationStatus: 'NOT_VERIFIED' } }),
      prisma.candidate.count({ where: { status: 'APPROVED' } }),
      prisma.candidate.count({ where: { status: 'REJECTED' } }),
      prisma.electoralArea.findMany({
        select: {
          id: true,
          name: true,
          code: true,
        },
      }),
      prisma.candidate.findMany({
        select: {
          id: true,
          pollingStationCode: true,
          position: true,
          delegateType: true,
          status: true,
          verificationStatus: true,
          contestStatus: true,
          electoralAreaId: true,
          electoralArea: { select: { name: true } },
          pollingStation: { select: { name: true, code: true } },
        },
      }),
      prisma.electoralArea.findMany({
        include: {
          _count: {
            select: { candidates: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.candidate.count(),
      prisma.electoralArea.count(),
      prisma.pollingStation.count(),
    ]);

    const electoralAreas: ElectoralAreaBrief[] = electoralAreasRaw.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
    }));

    const rows: DashboardCandidateInput[] = candidates.map((c) => ({
      id: c.id,
      pollingStationCode: c.pollingStationCode,
      position: c.position,
      delegateType: c.delegateType,
      status: c.status,
      contestStatus: c.contestStatus,
      verificationStatus: c.verificationStatus,
      electoralAreaId: c.electoralAreaId,
      electoralAreaName: c.electoralArea.name,
      pollingStationName: c.pollingStation?.name ?? null,
    }));

    const slotAgg = aggregateDashboardCandidates(rows, electoralAreas);
    const errorCount = rows.filter((r) => !canonicalizeDelegatePosition(r.position)).length;

    const stats = {
      totalCandidates,
      totalElectoralAreas,
      totalPollingStations,
      importedCount,
      vettedCount,
      newCount,
      oldCount,
      totalReports,
      unresolvedReports,
      verifiedCount,
      unverifiedCount,
      approvedCount,
      rejectedCount,
      errorCount,
      unopposedSlots: slotAgg.unopposedSlots,
      contestedSlots: slotAgg.contestedSlots,
      vacantSlots: slotAgg.vacantSlots,
      canonicalLogicalSlots: slotAgg.canonicalLogicalSlots,
      electoralAreasInRoll: slotAgg.electoralAreasInScope,
      /** @deprecated Use electoralAreasInRoll */
      pollingStationsInRoll: slotAgg.electoralAreasInScope,
      unopposedCount: slotAgg.unopposedSlots,
      contestedCount: slotAgg.contestedSlots,
      vacantCount: slotAgg.vacantSlots,
      byElectoralArea: byElectoralArea.map((area) => ({
        areaName: area.name,
        count: area._count.candidates,
      })),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
