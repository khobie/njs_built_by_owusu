import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { EA_FORM_NUMBER_MAX_LEN } from '@/lib/ea-portal-form-constants';

/** Contest = more than one delegate for same electoral area + position. */
export async function countContestSlots(where: Prisma.EaPortalIssuedFormWhereInput) {
  const groups = await prisma.eaPortalIssuedForm.groupBy({
    by: ['electoralAreaId', 'position'],
    where,
    _count: { _all: true },
  });
  let contests = 0;
  let unopposed = 0;
  let contestedDelegates = 0;
  let unopposedDelegates = 0;
  for (const g of groups) {
    const n = g._count._all;
    if (n > 1) {
      contests += 1;
      contestedDelegates += n;
    } else if (n === 1) {
      unopposed += 1;
      unopposedDelegates += n;
    }
  }
  return {
    contests,
    unopposed,
    contestedDelegates,
    unopposedDelegates,
    totalSlots: groups.length,
    groups,
  };
}

export async function findDuplicateDelegate(args: {
  electoralAreaId: string;
  position: string;
  phone: string;
  excludeId?: string;
}) {
  return prisma.eaPortalIssuedForm.findFirst({
    where: {
      electoralAreaId: args.electoralAreaId,
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
