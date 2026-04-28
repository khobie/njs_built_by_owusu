import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';

export async function PATCH(
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
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.verificationStatus !== undefined) {
      updateData.verificationStatus = body.verificationStatus;
    }

    // Validate that candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    if (user.role === 'VETTING_PANEL') {
      const allowed = await getSessionAreaCodes(user.id);
      const candidateArea = await prisma.candidate.findUnique({
        where: { id },
        select: { electoralArea: { select: { code: true } } },
      });
      if (!candidateArea?.electoralArea?.code || !allowed.includes(candidateArea.electoralArea.code)) {
        return NextResponse.json({ error: 'Forbidden for this electoral area' }, { status: 403 });
      }
    }

    // Only allow verification if polling station is assigned
    if (body.verificationStatus === 'VERIFIED' && !candidate.pollingStationCode) {
      return NextResponse.json(
        { error: 'Cannot verify candidate without a polling station assigned' },
        { status: 400 }
      );
    }

    const updated = await prisma.candidate.update({
      where: { id },
      data: updateData,
      include: {
        electoralArea: true,
        pollingStation: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error verifying candidate:', error);
    return NextResponse.json(
      { error: 'Failed to verify candidate' },
      { status: 500 }
    );
  }
}
