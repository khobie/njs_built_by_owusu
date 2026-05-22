import { prisma } from '@/lib/prisma';

export type SyncEaPortalAreasResult = {
  created: number;
  skipped: number;
  totalDelegateAreas: number;
  errors: string[];
};

/**
 * Create EaPortalArea rows from delegate `electoral_areas` (name + code).
 * Skips delegate areas that already have a portal row with the same `delegateAreaCode`.
 */
export async function syncEaPortalAreasFromDelegate(
  regionDefault = 'Ghana'
): Promise<SyncEaPortalAreasResult> {
  const region = regionDefault.trim() || 'Ghana';
  const delegates = await prisma.electoralArea.findMany({ orderBy: { name: 'asc' } });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const d of delegates) {
    const linked = await prisma.eaPortalArea.findFirst({
      where: { delegateAreaCode: d.code },
      select: { id: true },
    });
    if (linked) {
      skipped++;
      continue;
    }

    try {
      await prisma.eaPortalArea.create({
        data: {
          name: d.name,
          constituency: d.name,
          district: d.name,
          region,
          delegateAreaCode: d.code,
        },
      });
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${d.code}: ${msg}`);
    }
  }

  return {
    created,
    skipped,
    totalDelegateAreas: delegates.length,
    errors,
  };
}
