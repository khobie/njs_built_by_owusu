import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing contest status for all candidates...');

  // Get all candidates grouped by (pollingStationCode, position) for APPROVED status
  const approvedCandidates = await prisma.candidate.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true,
      pollingStationCode: true,
      position: true,
    },
  });

  // Group by composite key
  const groups = new Map<string, string[]>();
  approvedCandidates.forEach((c) => {
    const key = `${c.pollingStationCode || 'none'}_${c.position}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c.id);
  });

  // Update contest status
  const entries = Array.from(groups.entries());
  for (const [key, ids] of entries) {
    const status = ids.length === 1 ? 'UNOPPOSED' : 'CONTESTED';
    console.log(`Group ${key}: ${ids.length} candidates -> ${status}`);
    
    for (const id of ids) {
      await prisma.candidate.update({
        where: { id },
        data: { contestStatus: status },
      });
    }
  }

  // Set non-approved candidates to PENDING
  const nonApproved = await prisma.candidate.findMany({
    where: { status: { not: 'APPROVED' } },
    select: { id: true },
  });

  for (const c of nonApproved) {
    await prisma.candidate.update({
      where: { id: c.id },
      data: { contestStatus: 'PENDING' },
    });
  }

  console.log(`Updated ${approvedCandidates.length} approved candidates`);
  console.log(`Updated ${nonApproved.length} non-approved candidates`);
  console.log('Contest status initialization complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
