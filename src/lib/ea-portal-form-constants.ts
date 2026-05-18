/** EA portal form issuing — positions (separate from delegate nomination roles). */
export const EA_PORTAL_FORM_POSITIONS = [
  'CHAIRMAN',
  'SECRETARY',
  'ORGANIZER',
  'WOMAN ORGANIZER',
  'YOUTH ORGANIZER',
  'COMMUNICATION OFFICER',
  'ELECTORAL AFFAIRS OFFICER',
] as const;

export type EaPortalFormPosition = (typeof EA_PORTAL_FORM_POSITIONS)[number];

export const EA_FORM_APPLICANT_TYPES = ['EXISTING', 'NEW'] as const;
export type EaFormApplicantType = (typeof EA_FORM_APPLICANT_TYPES)[number];

export const EA_FORM_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type EaFormStatus = (typeof EA_FORM_STATUSES)[number];

export function normalizeEaFormPhone(input: string): string {
  return String(input).replace(/\s+/g, '').trim();
}

export function isEaFormPosition(value: string): value is EaPortalFormPosition {
  return (EA_PORTAL_FORM_POSITIONS as readonly string[]).includes(value);
}
