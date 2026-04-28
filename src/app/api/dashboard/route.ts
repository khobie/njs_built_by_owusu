import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aggregateDashboardCandidates, type DashboardCandidateInput } from '@/lib/dashboard-aggregates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const electoralAreaId = searchParams.get('electoralAreaId') || '';
    const delegateType = searchParams.get('delegateType') || '';

    const candidates = await prisma.candidate.findMany({
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
        verificationStatus: true,
        electoralAreaId: true,
        electoralArea: { select: { name: true } },
        pollingStation: { select: { name: true, code: true } },
      },
    });

    const rows: DashboardCandidateInput[] = candidates.map((c) => ({
      id: c.id,
      pollingStationCode: c.pollingStationCode,
      position: c.position,
      delegateType: c.delegateType,
      status: c.status,
      verificationStatus: c.verificationStatus,
      electoralAreaId: c.electoralAreaId,
      electoralAreaName: c.electoralArea.name,
      pollingStationName: c.pollingStation?.name ?? null,
    }));

    const aggregates = aggregateDashboardCandidates(rows);

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      filters: {
        electoralAreaId: electoralAreaId || null,
        delegateType: delegateType === 'NEW' || delegateType === 'OLD' ? delegateType : null,
      },
      aggregates,
    });
  } catch (error) {
    console.error('Dashboard GET error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
