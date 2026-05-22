import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { EA_FORM_NUMBER_MAX_LEN } from '@/lib/ea-portal-form-constants';

/** Contest = more than one delegate for same polling station + position. */
export async function countContestSlots(where: Prisma.EaPortalIssuedFormWhereInput) {
  const groups = await prisma.eaPortalIssuedForm.groupBy({
    by: ['pollingStationCode', 'position'],
    where: {
      ...where,
      pollingStationCode: { not: '' },
    },
    _count: { _all: true },
  });
  const contests = groups.filter((g) => g._count._all > 1).length;
  const unopposed = groups.filter((g) => g._count._all === 1).length;
  return { contests, unopposed, totalSlots: groups.length, groups };
}

export async function findDuplicateDelegate(args: {
  pollingStationCode: string;
  position: string;
  phone: string;
  excludeId?: string;
}) {
  return prisma.eaPortalIssuedForm.findFirst({
    where: {
      pollingStationCode: args.pollingStationCode,
      position: args.position,
      phone: args.phone,
      ...(args.excludeId ? { NOT: { id: args.excludeId } } : {}),
    },
    select: { id: true, formNumber: true, fullName: true },
  });
}

/** Auto-generate unique 6-character alphanumeric form number. */
export async function generateEaFormNumber(): Promise<string> {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 40; attempt++) {
    let s = '';
    for (let i = 0; i < EA_FORM_NUMBER_MAX_LEN; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    const taken = await prisma.eaPortalIssuedForm.findUnique({
      where: { formNumber: s },
      select: { id: true },
    });
    if (!taken) return s;
  }
  const count = await prisma.eaPortalIssuedForm.count();
  const fallback = String(count + 1)
    .padStart(EA_FORM_NUMBER_MAX_LEN, '0')
    .slice(-EA_FORM_NUMBER_MAX_LEN);
  return fallback;
}

export function normalizeEaFormStatus(status: string): string {
  if (status === 'PENDING') return 'PENDING_VETTING';
  return status;
}
