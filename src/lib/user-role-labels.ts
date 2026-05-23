/** Human-readable labels for all system roles (accounts UI, tables). */
export function userRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    FORM_ISSUER: 'Form Issuer (nomination)',
    VETTING_PANEL: 'Vetting Panel (nomination)',
    EA_PORTAL_ADMIN: 'EA Portal Admin (full)',
    EA_FORM_ISSUER: 'EA Form Issuer',
    EA_VETTING_PANEL: 'EA Vetting Panel',
    EA_OFFICER: 'EA Officer (issue + vet)',
    EA_DATA_ENTRY: 'EA Data Entry (full)',
  };
  return labels[role] ?? role;
}

export const CREATABLE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'FORM_ISSUER',
  'VETTING_PANEL',
  'EA_PORTAL_ADMIN',
  'EA_FORM_ISSUER',
  'EA_VETTING_PANEL',
  'EA_OFFICER',
  'EA_DATA_ENTRY',
] as const;

export type CreatableRole = (typeof CREATABLE_ROLES)[number];

/** Roles an actor may assign when creating accounts. */
export function creatableRolesForActor(actorRole: string): CreatableRole[] {
  if (actorRole === 'SUPER_ADMIN') return [...CREATABLE_ROLES];
  if (actorRole === 'ADMIN') {
    return CREATABLE_ROLES.filter((r) => r !== 'SUPER_ADMIN');
  }
  return [];
}
