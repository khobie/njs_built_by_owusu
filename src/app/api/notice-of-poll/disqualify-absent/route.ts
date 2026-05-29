import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';
import { canVet, hasSystemWideAccess } from '@/lib/roles';
import { calculateContestStatusForAll } from '@/lib/contest-status';
import { NON_ATTENDEE_REASON } from '@/lib/notice-of-poll-display';

/**
 * Disqualifies every applicant who returned/submitted a form but never received an
 * APPROVED or REJECTED decision (i.e. did not appear for vetting). The compulsory
 * disqualification reason is stamped automatically, then contest status is recomputed
 * across all approved applicants.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canVet(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scopeWhere: Record<string, unknown> = {
      status: { notIn: ['APPROVED', 'REJECTED'] },
    };

    if (!hasSystemWideAccess(user.role)) {
      const codes = await getSessionAreaCodes(user.id);
      scopeWhere.electoralArea = { code: { in: codes.length ? codes : ['__none__'] } };
    }

    const absentees = await prisma.candidate.findMany({
      where: scopeWhere,
      select: { id: true },
    });

    if (absentees.length === 0) {
      return NextResponse.json({ disqualified: 0, message: 'No absent applicants to disqualify.' });
    }

    await prisma.candidate.updateMany({
      where: { id: { in: absentees.map((c) => c.id) } },
      data: {
        status: 'REJECTED',
        verificationStatus: 'NOT_VERIFIED',
        comment: NON_ATTENDEE_REASON,
      },
    });

    // Recompute contest status now that the approved set may have changed.
    await calculateContestStatusForAll();

    return NextResponse.json({
      disqualified: absentees.length,
      message: `Disqualified ${absentees.length} applicant(s) who did not appear for vetting.`,
    });
  } catch (error) {
    console.error('Error disqualifying absent applicants:', error);
    return NextResponse.json({ error: 'Failed to disqualify absent applicants' }, { status: 500 });
  }
}
