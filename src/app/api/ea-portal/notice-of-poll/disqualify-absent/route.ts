import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canVetEaDelegates, formsVisibleWhere, logEaPortalActivity } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';
import { NON_ATTENDEE_REASON } from '@/lib/notice-of-poll-display';

/**
 * Disqualifies every EA Portal form that never received a VERIFIED or REJECTED
 * decision (i.e. the applicant did not appear for vetting). The compulsory reason
 * is stamped automatically. Contest status is derived on the fly, so no recompute
 * step is needed.
 */
export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canVetEaDelegates(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to vet delegates.' }, { status: 403 });
  }

  try {
    const visible = formsVisibleWhere(gate.scope);
    const where = {
      AND: [
        ...(Object.keys(visible).length > 0 ? [visible] : []),
        { status: { notIn: ['VERIFIED', 'REJECTED'] } },
      ],
    };

    const absentees = await prisma.eaPortalIssuedForm.findMany({
      where,
      select: { id: true },
    });

    if (absentees.length === 0) {
      return NextResponse.json({ disqualified: 0, message: 'No absent applicants to disqualify.' });
    }

    await prisma.eaPortalIssuedForm.updateMany({
      where: { id: { in: absentees.map((f) => f.id) } },
      data: {
        status: 'REJECTED',
        comment: NON_ATTENDEE_REASON,
        vettingNotes: NON_ATTENDEE_REASON,
        verifiedByUserId: gate.user.id,
        verifiedAt: new Date(),
      },
    });

    await logEaPortalActivity({
      action: 'VET_DISQUALIFY_ABSENT',
      actorUserId: gate.user.id,
      details: `Disqualified ${absentees.length} non-attendee(s)`,
    });

    return NextResponse.json({
      disqualified: absentees.length,
      message: `Disqualified ${absentees.length} applicant(s) who did not appear for vetting.`,
    });
  } catch (error) {
    console.error('Error disqualifying absent applicants:', error);
    return NextResponse.json({ error: 'Failed to disqualify absent applicants' }, { status: 500 });
  }
}
