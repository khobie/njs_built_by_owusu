import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { isAdminRole } from '@/lib/roles';
import {
  createUserAccount,
  UserAccountError,
  validateCreateUserInput,
  type CreateUserInput,
} from '@/lib/user-account';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      suspendedUntil: true,
      createdAt: true,
      electoralAreas: { select: { areaCode: true } },
      eaPortalAreas: { select: { eaPortalAreaId: true } },
    },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(sessionUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json()) as CreateUserInput;
  const validated = validateCreateUserInput(body, sessionUser.role);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const created = await createUserAccount(validated.data);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof UserAccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Create user failed:', e);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
