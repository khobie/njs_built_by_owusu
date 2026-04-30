import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof currentPassword !== 'string' || !currentPassword) {
      return NextResponse.json({ error: 'Current password is required.' }, { status: 400 });
    }
    if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
    }

    const record = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordHash: true },
    });
    if (!record) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const valid = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Change password failed:', error);
    return NextResponse.json({ error: 'Failed to change password.' }, { status: 500 });
  }
}
