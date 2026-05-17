import { prisma } from '@/lib/prisma';
import { canonicalizeDelegatePosition } from '@/lib/delegate-positions';

export type ContestStatus = 'UNOPPOSED' | 'CONTESTED' | 'VACANT' | 'PENDING';

type SlotRef = {
  electoralAreaId: string | null | undefined;
  position: string | null | undefined;
};

function makeSlotKey(slot: SlotRef): string | null {
  const id = (slot.electoralAreaId ?? '').trim();
  const canon = canonicalizeDelegatePosition(slot.position ?? '');
  if (!id || !canon) return null;
  return `${id}::${canon}`;
}

/**
 * Calculates contest status for all candidates (by approved count per electoral area × canonical role).
 */
export async function calculateContestStatusForAll() {
  const allCandidates = await prisma.candidate.findMany({
    select: {
      id: true,
      status: true,
      electoralAreaId: true,
      position: true,
    },
  });

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
 * Recalculate contest status for one slot (electoral area × canonical position).
 */
export async function recalculateContestStatusForGroup(
  electoralAreaId: string | null | undefined,
  position: string | null | undefined
) {
  const areaId = (electoralAreaId ?? '').trim();
  const canon = canonicalizeDelegatePosition(position ?? '');
  if (!areaId || !canon) {
    return calculateContestStatusForAll();
  }

  const inArea = await prisma.candidate.findMany({
    where: { electoralAreaId: areaId },
    select: {
      id: true,
      status: true,
      position: true,
    },
  });

  const candidatesInSlot = inArea.filter((c) => canonicalizeDelegatePosition(c.position) === canon);

  const approvedCount = candidatesInSlot.filter((c) => c.status === 'APPROVED').length;
  const slotStatus: ContestStatus =
    approvedCount === 0 ? 'VACANT' : approvedCount === 1 ? 'UNOPPOSED' : 'CONTESTED';

  if (candidatesInSlot.length > 0) {
    await prisma.candidate.updateMany({
      where: { id: { in: candidatesInSlot.map((c) => c.id) } },
      data: { contestStatus: slotStatus },
    });
  }
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
