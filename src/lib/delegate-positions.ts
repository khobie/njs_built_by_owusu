/**
 * Seven fixed delegate slots per polling station — one nominee per station × position.
 * Order preserved for dropdowns / station reports.
 */

export const CANONICAL_DELEGATE_POSITIONS = [
  'CHAIRMAN',
  'SECRETARY',
  'ORGANIZER',
  'WOMEN ORGANIZER',
  'YOUTH ORGANIZER',
  'COMMUNICATION OFFICER',
  'ELECTORAL AFFAIRS OFFICER',
] as const;

export type CanonicalDelegatePosition = (typeof CANONICAL_DELEGATE_POSITIONS)[number];

export const CANONICAL_POSITION_COUNT = CANONICAL_DELEGATE_POSITIONS.length;

const CANON_SET = new Set<string>(CANONICAL_DELEGATE_POSITIONS);

/** Map common typos / legacy labels onto the canonical roster */
const POSITION_ALIASES: Record<string, CanonicalDelegatePosition> = {
  SECRATARY: 'SECRETARY',
  SECRETORY: 'SECRETARY',
  SECRETERY: 'SECRETARY',
  'WOMAN ORGANIZER': 'WOMEN ORGANIZER',
  'ELECTORAL AREA AFFAIRS OFFICER': 'ELECTORAL AFFAIRS OFFICER',
  'ELECTORAL AREA AFFAIR OFFICER': 'ELECTORAL AFFAIRS OFFICER',
};

export function normalizeDelegatePosition(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function canonicalizeDelegatePosition(raw: string | null | undefined): CanonicalDelegatePosition | null {
  if (!raw?.trim()) return null;
  const n = normalizeDelegatePosition(raw);
  const mapped = POSITION_ALIASES[n];
  const key = (mapped ?? n) as string;
  return CANON_SET.has(key) ? (key as CanonicalDelegatePosition) : null;
}

export function isCanonicalDelegatePosition(raw: string | null | undefined): boolean {
  return canonicalizeDelegatePosition(raw) !== null;
}
