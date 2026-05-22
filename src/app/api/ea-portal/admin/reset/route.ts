import { NextRequest, NextResponse } from 'next/server';
import { logEaPortalActivity } from '@/lib/ea-portal-access';
import { resetEaPortalOperationalData } from '@/lib/ea-portal-reset';
import { requireEaPortal } from '@/lib/ea-portal-session';

/** Clear EA portal delegates, records, and activity logs. Does not touch polling-station Candidate data. */
export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) {
    return NextResponse.json({ error: 'Only portal admins can reset the Electoral Area module.' }, { status: 403 });
  }

  await resetEaPortalOperationalData();

  await logEaPortalActivity({
    action: 'MODULE_RESET',
    actorUserId: gate.user.id,
    details: 'Electoral Area operational data cleared',
  });

  return NextResponse.json({ ok: true, message: 'Electoral Area module data cleared.' });
}
