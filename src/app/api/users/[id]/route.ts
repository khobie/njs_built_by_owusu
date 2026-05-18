import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { isAdminRole } from '@/lib/roles';
import bcrypt from 'bcryptjs';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(sessionUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id } = params;
  const {
    name,
    role,
    isActive,
    areaCodes,
    eaPortalAreaIds,
    password,
  } = body as {
    name?: string;
    role?: string;
    isActive?: boolean;
    areaCodes?: string[];
    eaPortalAreaIds?: string[];
    password?: string;
  };

  if (password !== undefined && (typeof password !== 'string' || password.trim().length < 6)) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  const passwordHash = typeof password === 'string' && password.trim().length > 0
    ? await bcrypt.hash(password.trim(), 10)
    : undefined;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  if (areaCodes) {
    await prisma.userElectoralArea.deleteMany({ where: { userId: id } });
    if ((role ?? user.role) === 'VETTING_PANEL' && areaCodes.length > 0) {
      await prisma.userElectoralArea.createMany({
        data: areaCodes.map((areaCode) => ({ userId: id, areaCode })),
      });
    }
  }

  if (eaPortalAreaIds !== undefined) {
    await prisma.userEaPortalArea.deleteMany({ where: { userId: id } });
    const effectiveRole = role ?? user.role;
    if (effectiveRole === 'EA_OFFICER' && eaPortalAreaIds.length > 0) {
      await prisma.userEaPortalArea.createMany({
        data: eaPortalAreaIds.map((eaPortalAreaId) => ({ userId: id, eaPortalAreaId })),
      });
    }
  }

  return NextResponse.json(user);
}

