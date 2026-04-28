import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recalculateContestStatusForGroup } from '@/lib/contest-status';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(user.role === 'ADMIN' || user.role === 'VETTING_PANEL')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    // Check if candidate exists and get their polling station/position before updating
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { 
        id: true, 
        status: true,
        pollingStationCode: true,
        position: true
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    if (user.role === 'VETTING_PANEL') {
      const allowed = await getSessionAreaCodes(user.id);
      const row = await prisma.candidate.findUnique({
        where: { id },
        select: { electoralArea: { select: { code: true } } },
      });
      const code = row?.electoralArea?.code;
      if (!code || !allowed.includes(code)) {
        return NextResponse.json({ error: 'Forbidden for this electoral area' }, { status: 403 });
      }
    }

    // Update status to REJECTED and reset verification
    await prisma.candidate.update({
      where: { id },
      data: { 
        status: 'REJECTED',
        verificationStatus: 'NOT_VERIFIED',
      },
      include: {
        electoralArea: true,
        pollingStation: true,
      },
    });

    // If the candidate was approved, recalc contest status for their group
    if (candidate.status === 'APPROVED' && candidate.pollingStationCode) {
      await recalculateContestStatusForGroup(candidate.pollingStationCode, candidate.position);
    }

    const rejected = await prisma.candidate.findUnique({
      where: { id },
      include: {
        electoralArea: true,
        pollingStation: true,
      },
    });

    return NextResponse.json(rejected);
  } catch (error) {
    console.error('Error rejecting candidate:', error);
    return NextResponse.json(
      { error: 'Failed to reject candidate' },
      { status: 500 }
    );
  }
}
