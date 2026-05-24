import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { castPollVote, listActiveNoticesForUser } from '@/lib/notice-poll';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { optionId?: string };
  if (!body.optionId) {
    return NextResponse.json({ error: 'optionId is required.' }, { status: 400 });
  }

  try {
    await castPollVote(params.id, body.optionId, user.id);
    const notices = await listActiveNoticesForUser(user.id);
    const notice = notices.find((n) => n.id === params.id);
    return NextResponse.json({ ok: true, notice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to record vote.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
