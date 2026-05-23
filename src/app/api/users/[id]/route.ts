import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { needsEaPortalAreaAssignment } from '@/lib/ea-portal-user-roles';
import { isAdminRole, isSuperAdminRole, ROLES } from '@/lib/roles';
import {
  clearUserAccount,
  deleteUserAccount,
  UserAccountError,
  validateRoleAssignment,
} from '@/lib/user-account';
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
    clearAccount,
  } = body as {
    name?: string;
    role?: string;
    isActive?: boolean;
    areaCodes?: string[];
    eaPortalAreaIds?: string[];
    password?: string;
    clearAccount?: boolean;
  };

  if (clearAccount === true) {
    try {
      const cleared = await clearUserAccount(id, sessionUser);
      return NextResponse.json(cleared);
    } catch (e) {
      if (e instanceof UserAccountError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: 'Failed to clear account' }, { status: 500 });
    }
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true },
  });
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (role !== undefined) {
    if (!(ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    if (role === 'SUPER_ADMIN' && !isSuperAdminRole(sessionUser.role)) {
      return NextResponse.json(
        { error: 'Only a Super Admin can assign the Super Admin role.' },
        { status: 403 }
      );
    }
    if (existing.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN' && !isSuperAdminRole(sessionUser.role)) {
      return NextResponse.json(
        { error: 'Only a Super Admin can change a Super Admin account.' },
        { status: 403 }
      );
    }
  }

  if (password !== undefined && (typeof password !== 'string' || password.trim().length < 6)) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  const effectiveRole = role ?? existing.role;
  if (eaPortalAreaIds !== undefined) {
    const assignErr = validateRoleAssignment(effectiveRole, areaCodes, eaPortalAreaIds);
    if (assignErr) return NextResponse.json({ error: assignErr }, { status: 400 });
  }

  const passwordHash =
    typeof password === 'string' && password.trim().length > 0
      ? await bcrypt.hash(password.trim(), 10)
      : undefined;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  if (areaCodes !== undefined) {
    await prisma.userElectoralArea.deleteMany({ where: { userId: id } });
    if (effectiveRole === 'VETTING_PANEL' && areaCodes.length > 0) {
      await prisma.userElectoralArea.createMany({
        data: areaCodes.map((areaCode) => ({ userId: id, areaCode })),
        skipDuplicates: true,
      });
    }
  }

  if (eaPortalAreaIds !== undefined) {
    await prisma.userEaPortalArea.deleteMany({ where: { userId: id } });
    if (needsEaPortalAreaAssignment(effectiveRole) && eaPortalAreaIds.length > 0) {
      await prisma.userEaPortalArea.createMany({
        data: eaPortalAreaIds.map((eaPortalAreaId) => ({ userId: id, eaPortalAreaId })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json(user);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(sessionUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const result = await deleteUserAccount(params.id, sessionUser);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UserAccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
