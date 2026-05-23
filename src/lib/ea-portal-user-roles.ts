/** Roles that require UserEaPortalArea assignments (scoped portal access). */
export const EA_PORTAL_SCOPED_ROLES = ['EA_OFFICER', 'EA_FORM_ISSUER', 'EA_VETTING_PANEL'] as const;

export type EaPortalScopedRole = (typeof EA_PORTAL_SCOPED_ROLES)[number];

export function needsEaPortalAreaAssignment(role: string): boolean {
  return (EA_PORTAL_SCOPED_ROLES as readonly string[]).includes(role);
}

import { userRoleLabel } from '@/lib/user-role-labels';

/** @deprecated Use userRoleLabel */
export function eaPortalRoleLabel(role: string): string {
  return userRoleLabel(role);
}
