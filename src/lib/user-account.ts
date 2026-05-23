import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { needsEaPortalAreaAssignment } from '@/lib/ea-portal-user-roles';
import { isSuperAdminRole, ROLES } from '@/lib/roles';

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: string;
  areaCodes?: string[];
  eaPortalAreaIds?: string[];
};

export type ValidatedCreateUser = {
  name: string;
  email: string;
  password: string;
  role: string;
  areaCodes: string[];
  eaPortalAreaIds: string[];
};

export function validateCreateUserInput(
  input: CreateUserInput,
  actorRole: string
): { ok: true; data: ValidatedCreateUser } | { ok: false; error: string } {
  const name = input.name?.trim() ?? '';
  const email = normalizeUserEmail(input.email ?? '');
  const password = typeof input.password === 'string' ? input.password : '';
  const role = input.role?.trim() ?? '';
  const areaCodes = Array.isArray(input.areaCodes) ? input.areaCodes.filter(Boolean) : [];
  const eaPortalAreaIds = Array.isArray(input.eaPortalAreaIds)
    ? input.eaPortalAreaIds.filter(Boolean)
    : [];

  if (!name) return { ok: false, error: 'Name is required.' };
  if (!email) return { ok: false, error: 'Email is required.' };
  if (password.trim().length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  if (!role || !(ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: 'Invalid role.' };
  }
  if (role === 'SUPER_ADMIN' && !isSuperAdminRole(actorRole)) {
    return { ok: false, error: 'Only a Super Admin can create Super Admin accounts.' };
  }
  if (role === 'VETTING_PANEL' && areaCodes.length === 0) {
    return {
      ok: false,
      error: 'Vetting panel members must be assigned at least one nomination electoral area.',
    };
  }
  if (needsEaPortalAreaAssignment(role) && eaPortalAreaIds.length === 0) {
    return {
      ok: false,
      error: 'This EA portal role must be assigned to at least one electoral area.',
    };
  }

  return {
    ok: true,
    data: { name, email, password: password.trim(), role, areaCodes, eaPortalAreaIds },
  };
}

export function validateRoleAssignment(
  role: string,
  areaCodes: string[] | undefined,
  eaPortalAreaIds: string[] | undefined
): string | null {
  if (needsEaPortalAreaAssignment(role)) {
    if (!eaPortalAreaIds || eaPortalAreaIds.length === 0) {
      return 'EA portal scoped roles need at least one electoral area.';
    }
  }
  return null;
}

export async function createUserAccount(data: ValidatedCreateUser) {
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) {
    throw new UserAccountError('Email already exists.', 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const created = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (data.role === 'VETTING_PANEL' && data.areaCodes.length > 0) {
    await prisma.userElectoralArea.createMany({
      data: data.areaCodes.map((areaCode) => ({ userId: created.id, areaCode })),
      skipDuplicates: true,
    });
  }

  if (needsEaPortalAreaAssignment(data.role) && data.eaPortalAreaIds.length > 0) {
    await prisma.userEaPortalArea.createMany({
      data: data.eaPortalAreaIds.map((eaPortalAreaId) => ({
        userId: created.id,
        eaPortalAreaId,
      })),
      skipDuplicates: true,
    });
  }

  return created;
}

export class UserAccountError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'UserAccountError';
  }
}

type AccountActor = { id: string; role: string };
type TargetUser = { id: string; role: string; email: string };

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export function assertCanManageTargetUser(actor: AccountActor, target: TargetUser) {
  if (target.id === actor.id) {
    throw new UserAccountError('You cannot modify your own account with this action.', 403);
  }
  if (target.role === 'SUPER_ADMIN' && !isSuperAdminRole(actor.role)) {
    throw new UserAccountError('Only a Super Admin can manage Super Admin accounts.', 403);
  }
}

async function assertNotLastSuperAdmin(target: TargetUser) {
  if (target.role !== 'SUPER_ADMIN') return;
  const count = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
  if (count <= 1) {
    throw new UserAccountError('Cannot remove the only Super Admin account.', 400);
  }
}

/** Deactivate user and remove all electoral area assignments (keeps login record). */
export async function clearUserAccount(targetUserId: string, actor: AccountActor) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, email: true },
  });
  if (!target) throw new UserAccountError('User not found.', 404);

  assertCanManageTargetUser(actor, target);

  await prisma.$transaction(async (tx) => {
    await tx.userElectoralArea.deleteMany({ where: { userId: targetUserId } });
    await tx.userEaPortalArea.deleteMany({ where: { userId: targetUserId } });
    await tx.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
    });
  });

  return prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: userSelect,
  });
}

/** Permanently delete user; EA forms they issued are reassigned to the acting admin. */
export async function deleteUserAccount(targetUserId: string, actor: AccountActor) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, email: true },
  });
  if (!target) throw new UserAccountError('User not found.', 404);

  assertCanManageTargetUser(actor, target);
  await assertNotLastSuperAdmin(target);

  const issuedCount = await prisma.eaPortalIssuedForm.count({
    where: { issuedByUserId: targetUserId },
  });

  await prisma.$transaction(async (tx) => {
    if (issuedCount > 0) {
      await tx.eaPortalIssuedForm.updateMany({
        where: { issuedByUserId: targetUserId },
        data: { issuedByUserId: actor.id },
      });
    }
    await tx.eaPortalIssuedForm.updateMany({
      where: { verifiedByUserId: targetUserId },
      data: { verifiedByUserId: null },
    });
    await tx.user.delete({ where: { id: targetUserId } });
  });

  return { deleted: true, email: target.email, reassignedForms: issuedCount };
}
