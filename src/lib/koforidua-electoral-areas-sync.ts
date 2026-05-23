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
  errors: string[];
};

function portalUniqueKey(name: string, region: string) {
  return {
    name,
    constituency: name,
    district: name,
    region,
  };
}

async function reassignPortalAreaId(fromId: string, toId: string) {
  if (fromId === toId) return;
  await prisma.eaPortalIssuedForm.updateMany({
    where: { electoralAreaId: fromId },
    data: { electoralAreaId: toId },
  });
  await prisma.eaPortalRecord.updateMany({
    where: { electoralAreaId: fromId },
    data: { electoralAreaId: toId },
  });
  await prisma.eaPortalActivity.updateMany({
    where: { areaId: fromId },
    data: { areaId: toId },
  });
  const links = await prisma.userEaPortalArea.findMany({
    where: { eaPortalAreaId: fromId },
    select: { userId: true },
  });
  for (const link of links) {
    await prisma.userEaPortalArea.upsert({
      where: { userId_eaPortalAreaId: { userId: link.userId, eaPortalAreaId: toId } },
      create: { userId: link.userId, eaPortalAreaId: toId },
      update: {},
    });
  }
  await prisma.userEaPortalArea.deleteMany({ where: { eaPortalAreaId: fromId } });
}

async function removePortalAreaIfEmpty(id: string) {
  const [forms, records, links] = await Promise.all([
    prisma.eaPortalIssuedForm.count({ where: { electoralAreaId: id } }),
    prisma.eaPortalRecord.count({ where: { electoralAreaId: id } }),
    prisma.userEaPortalArea.count({ where: { eaPortalAreaId: id } }),
  ]);
  if (forms + records + links > 0) return false;
  await prisma.eaPortalArea.delete({ where: { id } });
  return true;
}

async function mergeResidentialPortalDuplicates(region: string) {
  const rows = await prisma.eaPortalArea.findMany({
    where: { name: { in: ['RESIDENTIAL AREA', 'RESDENTIAL AREA'] } },
  });
  if (rows.length <= 1) return;

  const keep =
    rows.find((r) => r.name === 'RESDENTIAL AREA') ??
    rows.find((r) => r.name === 'RESIDENTIAL AREA') ??
    rows[0];
  const code = electoralAreaCodeFromName('RESDENTIAL AREA');
  const key = portalUniqueKey('RESDENTIAL AREA', region);

  const canonical = await prisma.eaPortalArea.upsert({
    where: { name_constituency_district_region: key },
    create: { ...key, delegateAreaCode: code },
    update: { delegateAreaCode: code },
  });

  for (const row of rows) {
    if (row.id === canonical.id) continue;
    await reassignPortalAreaId(row.id, canonical.id);
    await removePortalAreaIfEmpty(row.id);
  }
}

async function mergeResidentialDelegateDuplicates() {
  const oldResidential = await prisma.electoralArea.findFirst({
    where: { name: 'RESIDENTIAL AREA' },
  });
  if (!oldResidential) return 0;

  const newCode = electoralAreaCodeFromName('RESDENTIAL AREA');
  const existing = await prisma.electoralArea.findFirst({
    where: { code: newCode },
  });

  if (existing && existing.id !== oldResidential.id) {
    await prisma.pollingStation.updateMany({
      where: { electoralAreaId: oldResidential.id },
      data: { electoralAreaId: existing.id },
    });
    await prisma.eaPortalArea.updateMany({
      where: { delegateAreaCode: oldResidential.code },
      data: { delegateAreaCode: newCode, name: 'RESDENTIAL AREA' },
    });
    await prisma.electoralArea.delete({ where: { id: oldResidential.id } });
    return 1;
  }

  await prisma.electoralArea.update({
    where: { id: oldResidential.id },
    data: { name: 'RESDENTIAL AREA', code: newCode },
  });
  return 1;
}

async function upsertPortalAreaForName(name: string, code: string, region: string) {
  const key = portalUniqueKey(name, region);
  const byCode = await prisma.eaPortalArea.findFirst({
    where: { delegateAreaCode: code },
    select: { id: true },
  });
  const byKey = await prisma.eaPortalArea.findUnique({
    where: { name_constituency_district_region: key },
    select: { id: true },
  });

  if (byCode && byKey && byCode.id !== byKey.id) {
    await reassignPortalAreaId(byCode.id, byKey.id);
    await removePortalAreaIfEmpty(byCode.id);
  }

  const target = byKey ?? byCode;
  if (target) {
    await prisma.eaPortalArea.update({
      where: { id: target.id },
      data: { ...key, delegateAreaCode: code },
    });
    return 'updated' as const;
  }

  await prisma.eaPortalArea.create({
    data: { ...key, delegateAreaCode: code },
  });
  return 'created' as const;
}

/**
 * Ensure delegate `electoral_areas` and `ea_portal_areas` match the canonical 34-area list.
 * Never throws — errors are collected in `errors`.
 */
export async function syncKoforiduaElectoralAreas(
  regionDefault = 'Ghana'
): Promise<SyncKoforiduaAreasResult> {
  const region = regionDefault.trim() || 'Ghana';
  let delegateUpserted = 0;
  let portalCreated = 0;
  let portalUpdated = 0;
  let renamedFromResidential = 0;
  const errors: string[] = [];

  try {
    renamedFromResidential = await mergeResidentialDelegateDuplicates();
    await mergeResidentialPortalDuplicates(region);
  } catch (e) {
    errors.push(`residential-merge: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const name of KOFORIDUA_ELECTORAL_AREAS) {
    const code = electoralAreaCodeFromName(name);
    try {
      await prisma.electoralArea.upsert({
        where: { code },
        create: { name, code },
        update: { name },
      });
      delegateUpserted++;
    } catch (e) {
      errors.push(`delegate ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const action = await upsertPortalAreaForName(name, code, region);
      if (action === 'created') portalCreated++;
      else portalUpdated++;
    } catch (e) {
      errors.push(`portal ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    delegateUpserted,
    portalCreated,
    portalUpdated,
    renamedFromResidential,
    errors,
  };
}
