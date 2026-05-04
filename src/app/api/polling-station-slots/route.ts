import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { hasSystemWideAccess } from '@/lib/roles';
import {
  buildStationCanonicalSlotReports,
  type DashboardCandidateInput,
  type PollingStationBrief,
} from '@/lib/dashboard-aggregates';
import { CANONICAL_DELEGATE_POSITIONS } from '@/lib/delegate-positions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasSystemWideAccess(sessionUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const electoralAreaId = searchParams.get('electoralAreaId') || '';
    const delegateType = searchParams.get('delegateType') || '';

    const [pollingStationsRaw, candidates] = await Promise.all([
      prisma.pollingStation.findMany({
        where: electoralAreaId ? { electoralAreaId } : undefined,
        orderBy: [{ electoralAreaId: 'asc' }, { name: 'asc' }],
        select: {
          code: true,
          name: true,
          electoralAreaId: true,
          electoralArea: { select: { name: true } },
        },
      }),
      prisma.candidate.findMany({
        where: {
          AND: [
            electoralAreaId ? { electoralAreaId } : {},
            delegateType === 'NEW' || delegateType === 'OLD' ? { delegateType } : {},
          ],
        },
        select: {
          id: true,
          pollingStationCode: true,
          position: true,
          delegateType: true,
          status: true,
          contestStatus: true,
          verificationStatus: true,
          electoralAreaId: true,
          electoralArea: { select: { name: true } },
          pollingStation: { select: { name: true, code: true } },
        },
      }),
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

    const reports = buildStationCanonicalSlotReports(rows, pollingStations);

    return NextResponse.json({
      positions: [...CANONICAL_DELEGATE_POSITIONS],
      filters: {
        electoralAreaId: electoralAreaId || null,
        delegateType: delegateType === 'NEW' || delegateType === 'OLD' ? delegateType : null,
      },
      totals: reports.totals,
      stations: reports.stations,
      candidateRecordsInView: candidates.length,
    });
  } catch (error) {
    console.error('polling-station-slots GET:', error);
    return NextResponse.json({ error: 'Failed to load slot report' }, { status: 500 });
  }
}
