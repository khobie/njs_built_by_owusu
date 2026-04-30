import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recalculateContestStatusForGroup } from '@/lib/contest-status';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';
import { canVet } from '@/lib/roles';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canVet(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    // Find candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: { pollingStation: true, electoralArea: true },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    if (user.role === 'VETTING_PANEL') {
      const allowed = await getSessionAreaCodes(user.id);
      const areaCode = candidate.electoralArea?.code;
      if (!areaCode || !allowed.includes(areaCode)) {
        return NextResponse.json({ error: 'Forbidden for this electoral area' }, { status: 403 });
      }
    }

    // Validation checks before approval
    if (!candidate.pollingStationCode) {
      return NextResponse.json(
        { error: 'Cannot approve: Polling station is not assigned' },
        { status: 400 }
      );
    }

    if (!candidate.electoralAreaId) {
      return NextResponse.json(
        { error: 'Cannot approve: Electoral area is not assigned' },
        { status: 400 }
      );
    }

    if (!candidate.phoneNumber) {
      return NextResponse.json(
        { error: 'Cannot approve: Phone number is required' },
        { status: 400 }
      );
    }

    if (candidate.verificationStatus !== 'VERIFIED') {
      return NextResponse.json(
        { error: 'Cannot approve: Candidate must be verified first' },
        { status: 400 }
      );
    }

    // Update status to APPROVED
    const approved = await prisma.candidate.update({
      where: { id },
      data: { status: 'APPROVED' },
      include: {
        electoralArea: true,
        pollingStation: true,
      },
    });

    // Recalculate contest status by strict slot key: polling_station_code + position
    await recalculateContestStatusForGroup(candidate.pollingStationCode, candidate.position);

    return NextResponse.json(approved);
  } catch (error) {
    console.error('Error approving candidate:', error);
    return NextResponse.json(
      { error: 'Failed to approve candidate' },
      { status: 500 }
    );
  }
}
