import { NextRequest, NextResponse } from 'next/server';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';
import { canVet, hasSystemWideAccess } from '@/lib/roles';
import { buildNoticeOfPollData, parseNoticeOfPollFilters } from '@/lib/notice-of-poll';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canVet(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scope = hasSystemWideAccess(user.role) ? null : await getSessionAreaCodes(user.id);
    const filters = parseNoticeOfPollFilters(new URL(request.url).searchParams);
    const payload = await buildNoticeOfPollData(scope, filters);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error building notice of poll:', error);
    return NextResponse.json({ error: 'Failed to build notice of poll' }, { status: 500 });
  }
}
