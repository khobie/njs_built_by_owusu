import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export function canAccessEaPortal(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    role === 'EA_PORTAL_ADMIN' ||
    role === 'EA_OFFICER' ||
    role === 'EA_DATA_ENTRY'
  );
}

/** Full CRUD across all portal areas (not scoped). */
export function hasFullEaPortalAccess(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    role === 'EA_PORTAL_ADMIN' ||
    role === 'EA_DATA_ENTRY'
  );
}

/**
 * @returns `null` = all areas; string[] = only these EaPortalArea ids (EA_OFFICER).
 */
export async function getEaPortalScopeAreaIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  if (hasFullEaPortalAccess(role)) return null;
  if (role === 'EA_OFFICER') {
    const rows = await prisma.userEaPortalArea.findMany({
      where: { userId },
      select: { eaPortalAreaId: true },
    });
    return rows.map((r) => r.eaPortalAreaId);
  }
  return [];
}

export function areaFilterForScope(
  scope: string[] | null
): Prisma.EaPortalAreaWhereInput | undefined {
  if (scope === null) return undefined;
  return { id: { in: scope } };
}

/** Records visible: unassigned + records in scoped areas. */
export function recordsVisibleWhere(scope: string[] | null): Prisma.EaPortalRecordWhereInput {
  if (scope === null) return {};
  return {
    OR: [{ electoralAreaId: null }, { electoralAreaId: { in: scope } }],
  };
}

/** Issued EA forms: always tied to a portal area; officers only see their areas. */
export function formsVisibleWhere(scope: string[] | null): Prisma.EaPortalIssuedFormWhereInput {
  if (scope === null) return {};
  return { electoralAreaId: { in: scope } };
}

export async function logEaPortalActivity(args: {
  action: string;
  details?: string;
  actorUserId?: string;
  areaId?: string | null;
  recordId?: string | null;
}): Promise<void> {
  try {
    await prisma.eaPortalActivity.create({
      data: {
        action: args.action,
        details: args.details ?? null,
        actorUserId: args.actorUserId ?? null,
        areaId: args.areaId ?? null,
        recordId: args.recordId ?? null,
      },
    });
  } catch (e) {
    console.error('ea-portal activity log failed', e);
  }
}
