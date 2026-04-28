import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makeSlotKey } from '@/lib/dashboard-aggregates';

export async function GET() {
   try {
     const [
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
       candidatesForSlots,
       byElectoralArea,
     ] = await Promise.all([
       prisma.candidate.count(),
       prisma.electoralArea.count(),
       prisma.pollingStation.count(),
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
       prisma.candidate.count({ where: { OR: [{ pollingStationCode: null }, { pollingStationCode: '' }] } }),
       prisma.candidate.findMany({
         select: {
           pollingStationCode: true,
           position: true,
           status: true,
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
     ]);

     const slotApprovedCounts = new Map<string, number>();
     candidatesForSlots.forEach((candidate) => {
       const key = makeSlotKey(candidate.pollingStationCode, candidate.position);
       if (!key) return;
       if (candidate.status === 'APPROVED') {
         slotApprovedCounts.set(key, (slotApprovedCounts.get(key) ?? 0) + 1);
       } else if (!slotApprovedCounts.has(key)) {
         slotApprovedCounts.set(key, 0);
       }
     });

     let contestedSlots = 0;
     let unopposedSlots = 0;
     let vacantSlots = 0;
     slotApprovedCounts.forEach((approvedCount) => {
       if (approvedCount > 1) contestedSlots += 1;
       else if (approvedCount === 1) unopposedSlots += 1;
       else vacantSlots += 1;
     });

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
       // New slot-level metric names
       unopposedSlots,
       contestedSlots,
       vacantSlots,
       // Backward-compatible aliases
       unopposedCount: unopposedSlots,
       contestedCount: contestedSlots,
       vacantCount: vacantSlots,
       byElectoralArea: byElectoralArea.map((area) => ({
         areaName: area.name,
         count: area._count.candidates,
       })),
     };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

