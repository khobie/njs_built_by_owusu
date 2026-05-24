import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createNoticeWithPoll, listActiveNoticesForUser } from '@/lib/notice-poll';
import { isAdminRole } from '@/lib/roles';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const notices = await listActiveNoticesForUser(user.id);
  return NextResponse.json({ notices, isAdmin: isAdminRole(user.role) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    body?: string;
    hasPoll?: boolean;
    expiresAt?: string | null;
    options?: { label: string }[];
  };

  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: 'Invalid expiry date.' }, { status: 400 });
    }
  }

  try {
    const created = await createNoticeWithPoll({
      title: body.title ?? '',
      body: body.body ?? '',
      hasPoll: Boolean(body.hasPoll),
      expiresAt,
      options: Array.isArray(body.options) ? body.options : [],
      createdById: user.id,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create notice.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
