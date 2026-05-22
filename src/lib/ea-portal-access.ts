import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export function canAccessEaPortal(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    role === 'EA_PORTAL_ADMIN' ||
    role === 'EA_FORM_ISSUER' ||
    role === 'EA_VETTING_PANEL' ||
    role === 'EA_OFFICER' ||
    role === 'EA_DATA_ENTRY'
  );
}

/** Full admin: all areas, reset, area CRUD. */
export function hasFullEaPortalAccess(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    role === 'EA_PORTAL_ADMIN' ||
    role === 'EA_DATA_ENTRY'
  );
}

export function canIssueEaForms(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    hasFullEaPortalAccess(role) ||
    role === 'EA_FORM_ISSUER' ||
    role === 'EA_OFFICER'
  );
}

export function canVetEaDelegates(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    hasFullEaPortalAccess(role) ||
    role === 'EA_VETTING_PANEL' ||
    role === 'EA_OFFICER'
  );
}

/**
 * @returns `null` = all areas; string[] = only these EaPortalArea ids (scoped roles).
 */
export async function getEaPortalScopeAreaIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  if (hasFullEaPortalAccess(role)) return null;
  if (role === 'EA_OFFICER' || role === 'EA_VETTING_PANEL' || role === 'EA_FORM_ISSUER') {
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
  if (scope.length === 0) return { id: { in: [] } };
  return { id: { in: scope } };
}

export function recordsVisibleWhere(scope: string[] | null): Prisma.EaPortalRecordWhereInput {
  if (scope === null) return {};
  return {
    OR: [{ electoralAreaId: null }, { electoralAreaId: { in: scope } }],
  };
}

export function formsVisibleWhere(scope: string[] | null): Prisma.EaPortalIssuedFormWhereInput {
  if (scope === null) return {};
  if (scope.length === 0) return { electoralAreaId: { in: [] } };
  return { electoralAreaId: { in: scope } };
}

export async function logEaPortalActivity(args: {
  action: string;
  details?: string;
  actorUserId?: string;
  areaId?: string | null;
  recordId?: string | null;
  formId?: string | null;
}): Promise<void> {
  try {
    await prisma.eaPortalActivity.create({
      data: {
        action: args.action,
        details: args.details ?? null,
        actorUserId: args.actorUserId ?? null,
        areaId: args.areaId ?? null,
        recordId: args.recordId ?? null,
        formId: args.formId ?? null,
      },
    });
  } catch (e) {
    console.error('ea-portal activity log failed', e);
  }
}
