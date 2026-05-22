import { prisma } from '@/lib/prisma';
import {
  KOFORIDUA_ELECTORAL_AREAS,
  electoralAreaCodeFromName,
} from '@/lib/koforidua-electoral-areas';

export type SyncKoforiduaAreasResult = {
  delegateUpserted: number;
  portalCreated: number;
  portalUpdated: number;
  renamedFromResidential: number;
};

/**
 * Ensure delegate `electoral_areas` and `ea_portal_areas` match the canonical 34-area list.
 */
export async function syncKoforiduaElectoralAreas(
  regionDefault = 'Ghana'
): Promise<SyncKoforiduaAreasResult> {
  const region = regionDefault.trim() || 'Ghana';
  let delegateUpserted = 0;
  let portalCreated = 0;
  let portalUpdated = 0;
  let renamedFromResidential = 0;

  const oldResidential = await prisma.electoralArea.findFirst({
    where: { name: 'RESIDENTIAL AREA' },
  });
  if (oldResidential) {
    const newCode = electoralAreaCodeFromName('RESDENTIAL AREA');
    const clash = await prisma.electoralArea.findFirst({
      where: { code: newCode, NOT: { id: oldResidential.id } },
    });
    if (!clash) {
      await prisma.electoralArea.update({
        where: { id: oldResidential.id },
        data: { name: 'RESDENTIAL AREA', code: newCode },
      });
      renamedFromResidential++;
      const portal = await prisma.eaPortalArea.findFirst({
        where: { delegateAreaCode: oldResidential.code },
      });
      if (portal) {
        await prisma.eaPortalArea.update({
          where: { id: portal.id },
          data: { name: 'RESDENTIAL AREA', delegateAreaCode: newCode },
        });
      }
    }
  }

  for (const name of KOFORIDUA_ELECTORAL_AREAS) {
    const code = electoralAreaCodeFromName(name);
    await prisma.electoralArea.upsert({
      where: { code },
      create: { name, code },
      update: { name },
    });
    delegateUpserted++;

    const portal = await prisma.eaPortalArea.findFirst({
      where: { OR: [{ delegateAreaCode: code }, { name }] },
    });
    if (!portal) {
      await prisma.eaPortalArea.create({
        data: {
          name,
          constituency: name,
          district: name,
          region,
          delegateAreaCode: code,
        },
      });
      portalCreated++;
    } else if (portal.name !== name || portal.delegateAreaCode !== code) {
      await prisma.eaPortalArea.update({
        where: { id: portal.id },
        data: { name, delegateAreaCode: code },
      });
      portalUpdated++;
    }
  }

  return {
    delegateUpserted,
    portalCreated,
    portalUpdated,
    renamedFromResidential,
  };
}
