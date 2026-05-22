/** Roles that require UserEaPortalArea assignments (scoped portal access). */
export const EA_PORTAL_SCOPED_ROLES = ['EA_OFFICER', 'EA_FORM_ISSUER', 'EA_VETTING_PANEL'] as const;

export type EaPortalScopedRole = (typeof EA_PORTAL_SCOPED_ROLES)[number];

export function needsEaPortalAreaAssignment(role: string): boolean {
  return (EA_PORTAL_SCOPED_ROLES as readonly string[]).includes(role);
}

export function eaPortalRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    EA_PORTAL_ADMIN: 'EA Portal Admin',
    EA_FORM_ISSUER: 'EA Form Issuer',
    EA_VETTING_PANEL: 'EA Vetting Panel',
    EA_OFFICER: 'Electoral Area Officer',
    EA_DATA_ENTRY: 'EA Data Entry',
    FORM_ISSUER: 'Form Issuer (nomination)',
    VETTING_PANEL: 'Vetting Panel (nomination)',
  };
  return labels[role] ?? role;
}
