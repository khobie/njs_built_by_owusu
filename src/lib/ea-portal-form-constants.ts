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

/** Aligns with delegate `Candidate.delegateType`: New vs Old delegate. */
export const EA_FORM_DELEGATE_TYPES = ['NEW', 'OLD'] as const;
export type EaFormDelegateType = (typeof EA_FORM_DELEGATE_TYPES)[number];

export const EA_FORM_NUMBER_MAX_LEN = 6;

export const EA_FORM_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type EaFormStatus = (typeof EA_FORM_STATUSES)[number];

export function normalizeEaFormPhone(input: string): string {
  return String(input).replace(/\s+/g, '').trim();
}

export function isEaFormPosition(value: string): value is EaPortalFormPosition {
  return (EA_PORTAL_FORM_POSITIONS as readonly string[]).includes(value);
}

export function buildEaFormFullName(
  firstName: string,
  middleName: string | null | undefined,
  surname: string
): string {
  return [firstName, middleName, surname]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function isEaFormDelegateType(value: string): value is EaFormDelegateType {
  return (EA_FORM_DELEGATE_TYPES as readonly string[]).includes(value);
}
