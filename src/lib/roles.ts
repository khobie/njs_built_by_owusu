export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'FORM_ISSUER', 'VETTING_PANEL'] as const;

export type Role = (typeof ROLES)[number];

export function isSuperAdminRole(role: string | null | undefined): role is 'SUPER_ADMIN' {
  return role === 'SUPER_ADMIN';
}

export function isAdminRole(role: string | null | undefined): role is 'SUPER_ADMIN' | 'ADMIN' {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

/** Full EC dashboard, reports, imports, accounts — coordinators only */
export function hasSystemWideAccess(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function canIssueForms(role: string | null | undefined): boolean {
  return isAdminRole(role) || role === 'FORM_ISSUER';
}

export function canVet(role: string | null | undefined): boolean {
  return isAdminRole(role) || role === 'VETTING_PANEL';
}

