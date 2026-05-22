import { prisma } from '@/lib/prisma';

/**
 * Clear Electoral Area portal operational data only.
 * Does NOT touch Candidate, PollingStation, ElectoralArea (delegate module).
 */
export async function resetEaPortalOperationalData() {
  await prisma.$transaction([
    prisma.eaPortalActivity.deleteMany({}),
    prisma.eaPortalIssuedForm.deleteMany({}),
    prisma.eaPortalRecord.deleteMany({}),
  ]);
}
