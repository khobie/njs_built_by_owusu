/** Canonical Koforidua electoral areas (34) — order used in dropdowns. */
export const KOFORIDUA_ELECTORAL_AREAS = [
  'OSABENE MILE 50',
  'ADWESO ESTATE',
  'ADWESO TOWN',
  'TWO STREAMS',
  'NYEREDE NORTH',
  'NYEREDE SOUTH',
  'RESDENTIAL AREA',
  'OGUAA',
  'ASUOFIRISO',
  'ANGLICAN',
  'ADONTUA',
  'OHEMAA PARK',
  'SCHOOL TOWN',
  'OLD ESTATE WEST',
  'OLD ESTATE EAST',
  'TANOSO',
  'NSUKWAOSO ABOTANSO',
  'NSUKWAOSO',
  'RAILWAY STATION',
  'DEBRAKROM',
  'AKWAASU ASEBI',
  'CENTRAL MARKET AREA',
  'SOCIAL WELFARE',
  'KANTUDU',
  'CENTRAL HOSPITAL',
  'ANLO TOWN SOUTH',
  'ANLO TOWN NORTH',
  'KLU TOWN',
  'COMMUNITY A & B',
  'COMMUNITY C',
  'COMMUNITY D',
  'ADA',
  'NYAMEKROM',
  'SEMPOAMIENSA',
] as const;

export type KoforiduaElectoralAreaName = (typeof KOFORIDUA_ELECTORAL_AREAS)[number];

export function electoralAreaCodeFromName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, '-').replace(/&/g, 'AND');
}

const orderIndex = new Map(KOFORIDUA_ELECTORAL_AREAS.map((n, i) => [n.toUpperCase(), i]));

/** Sort portal/delegate area rows by the canonical list order. */
export function sortByKoforiduaAreaOrder<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ia = orderIndex.get(a.name.toUpperCase()) ?? 999;
    const ib = orderIndex.get(b.name.toUpperCase()) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name);
  });
}
