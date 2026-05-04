import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  aggregateDashboardCandidates,
  type DashboardCandidateInput,
  type PollingStationBrief,
} from '@/lib/dashboard-aggregates';

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
      errorCount,
      pollingStationsRaw,
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
      prisma.candidate.count({
        where: { OR: [{ pollingStationCode: null }, { pollingStationCode: '' }] },
      }),
      prisma.pollingStation.findMany({
        select: {
          code: true,
          name: true,
          electoralAreaId: true,
          electoralArea: { select: { name: true } },
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

    const pollingStations: PollingStationBrief[] = pollingStationsRaw.map((s) => ({
      code: s.code,
      name: s.name,
      electoralAreaId: s.electoralAreaId,
      electoralAreaName: s.electoralArea.name,
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

    const slotAgg = aggregateDashboardCandidates(rows, pollingStations);

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
      pollingStationsInRoll: slotAgg.pollingStationsInScope,
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
