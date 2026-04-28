import { prisma } from '@/lib/prisma';

export type ContestStatus = 'UNOPPOSED' | 'CONTESTED' | 'VACANT' | 'PENDING';

type SlotRef = {
  pollingStationCode: string | null | undefined;
  position: string | null | undefined;
};

function makeSlotKey(slot: SlotRef): string | null {
  const code = (slot.pollingStationCode ?? '').trim();
  const position = (slot.position ?? '').trim();
  if (!code || !position) return null;
  return `${code}::${position}`;
}

/**
 * Calculates contest status for all approved candidates
 * Groups by (polling_station_code, position) and determines:
 * - UNOPPOSED: exactly 1 approved candidate
 * - CONTESTED: more than 1 approved candidate  
 * - VACANT: 0 approved candidates
 * - PENDING: candidate not yet approved
 */
export async function calculateContestStatusForAll() {
  const allCandidates = await prisma.candidate.findMany({
    select: {
      id: true,
      status: true,
      pollingStationCode: true,
      position: true,
    },
  });

  // Group all candidates by strict slot key (polling_station_code + position).
  const byKey = new Map<string, typeof allCandidates>();
  const missingKeyIds: string[] = [];

  allCandidates.forEach((candidate) => {
    const key = makeSlotKey(candidate);
    if (!key) {
      missingKeyIds.push(candidate.id);
      return;
    }
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(candidate);
    } else {
      byKey.set(key, [candidate]);
    }
  });

  let unopposedCount = 0;
  let contestedCount = 0;
  let vacantCount = 0;

  // Apply slot status to every candidate in each slot:
  // approved count 0 => VACANT, 1 => UNOPPOSED, >1 => CONTESTED
  for (const candidatesInSlot of Array.from(byKey.values())) {
    const approvedCount = candidatesInSlot.filter((c) => c.status === 'APPROVED').length;
    const slotStatus: ContestStatus =
      approvedCount === 0 ? 'VACANT' : approvedCount === 1 ? 'UNOPPOSED' : 'CONTESTED';

    if (slotStatus === 'UNOPPOSED') unopposedCount += 1;
    if (slotStatus === 'CONTESTED') contestedCount += 1;
    if (slotStatus === 'VACANT') vacantCount += 1;

    const ids = candidatesInSlot.map((c) => c.id);
    await prisma.candidate.updateMany({
      where: { id: { in: ids } },
      data: { contestStatus: slotStatus },
    });
  }

  if (missingKeyIds.length > 0) {
    await prisma.candidate.updateMany({
      where: { id: { in: missingKeyIds } },
      data: { contestStatus: 'PENDING' },
    });
  }

  return {
    totalGroups: byKey.size,
    unopposedCount,
    contestedCount,
    vacantCount,
    pendingCount: missingKeyIds.length,
  };
}

/**
 * Recalculate contest status for one slot (polling_station_code + position).
 * Also marks malformed records (missing slot fields) as PENDING.
 */
export async function recalculateContestStatusForGroup(
  pollingStationCode: string | null | undefined,
  position: string | null | undefined
) {
  const key = makeSlotKey({ pollingStationCode, position });
  if (!key) {
    return calculateContestStatusForAll();
  }

  const [code, pos] = key.split('::');
  const candidatesInSlot = await prisma.candidate.findMany({
    where: {
      pollingStationCode: code,
      position: pos,
    },
    select: {
      id: true,
      status: true,
    },
  });

  const approvedCount = candidatesInSlot.filter((c) => c.status === 'APPROVED').length;
  const slotStatus: ContestStatus =
    approvedCount === 0 ? 'VACANT' : approvedCount === 1 ? 'UNOPPOSED' : 'CONTESTED';

  if (candidatesInSlot.length > 0) {
    await prisma.candidate.updateMany({
      where: { id: { in: candidatesInSlot.map((c) => c.id) } },
      data: { contestStatus: slotStatus },
    });
  }

  await prisma.candidate.updateMany({
    where: {
      OR: [{ pollingStationCode: null }, { pollingStationCode: '' }, { position: '' }],
    },
    data: { contestStatus: 'PENDING' },
  });
}

/**
 * Get contest status summary
 */
export async function getContestStatusStats() {
  const stats = await prisma.candidate.groupBy({
    by: ['contestStatus'],
    _count: true,
  });

  return {
    unopposed: stats.find(s => s.contestStatus === 'UNOPPOSED')?._count || 0,
    contested: stats.find(s => s.contestStatus === 'CONTESTED')?._count || 0,
    vacant: stats.find(s => s.contestStatus === 'VACANT')?._count || 0,
    pending: stats.find(s => s.contestStatus === 'PENDING')?._count || 0,
  };
}
