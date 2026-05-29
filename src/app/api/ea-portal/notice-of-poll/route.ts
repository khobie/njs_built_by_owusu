import { NextRequest, NextResponse } from 'next/server';
import { requireEaPortal } from '@/lib/ea-portal-session';
import { buildNoticeOfPollData, parseNoticeOfPollFilters } from '@/lib/notice-of-poll';

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  try {
    const filters = parseNoticeOfPollFilters(new URL(request.url).searchParams);
    const payload = await buildNoticeOfPollData(gate.scope, filters);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error building notice of poll:', error);
    return NextResponse.json({ error: 'Failed to build notice of poll' }, { status: 500 });
  }
}
