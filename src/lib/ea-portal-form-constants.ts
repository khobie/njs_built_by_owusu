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
export const EA_VOTER_ID_MAX_LEN = 20;

export const EA_FORM_LIST_SELECT = {
  id: true,
  fullName: true,
  surname: true,
  firstName: true,
  middleName: true,
  phone: true,
  voterId: true,
  gender: true,
  address: true,
  electoralAreaId: true,
  pollingStationCode: true,
  pollingStationName: true,
  position: true,
  formNumber: true,
  delegateType: true,
  comment: true,
  status: true,
  vettingNotes: true,
  verifiedAt: true,
  returnedAt: true,
  sourceCandidateId: true,
  issuedByUserId: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function normalizeEaVoterId(input: string): string {
  return String(input).replace(/\s+/g, '').trim().toUpperCase();
}

export const EA_FORM_STATUSES = [
  'ISSUED',
  'RETURNED',
  'PENDING_VETTING',
  'VERIFIED',
  'REJECTED',
] as const;
export type EaFormStatus = (typeof EA_FORM_STATUSES)[number];

/** @deprecated legacy status — mapped to PENDING_VETTING in APIs */
export const EA_FORM_LEGACY_STATUSES = ['PENDING'] as const;

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
