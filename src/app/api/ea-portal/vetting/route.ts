import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canVetEaDelegates, formsVisibleWhere } from '@/lib/ea-portal-access';
import { normalizeEaFormStatus } from '@/lib/ea-portal-delegate';
import { requireEaPortal } from '@/lib/ea-portal-session';

const querySchema = z.object({
  electoralAreaId: z.string().optional(),
  pollingStationCode: z.string().optional(),
  position: z.string().optional(),
  delegateType: z.enum(['NEW', 'OLD']).optional(),
  status: z.string().optional(),
  contestOnly: z.enum(['1', 'true']).optional(),
  unopposedOnly: z.enum(['1', 'true']).optional(),
  q: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canVetEaDelegates(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to access vetting.' }, { status: 403 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const parts: Prisma.EaPortalIssuedFormWhereInput[] = [formsVisibleWhere(gate.scope)];

  if (parsed.data.electoralAreaId) parts.push({ electoralAreaId: parsed.data.electoralAreaId });
  if (parsed.data.pollingStationCode) parts.push({ pollingStationCode: parsed.data.pollingStationCode });
  if (parsed.data.position) parts.push({ position: parsed.data.position });
  if (parsed.data.delegateType) parts.push({ delegateType: parsed.data.delegateType });
  if (parsed.data.status) {
    const st = parsed.data.status === 'PENDING' ? 'PENDING_VETTING' : parsed.data.status;
    parts.push({ status: st });
  }

  if (parsed.data.q?.trim()) {
    const q = parsed.data.q.trim();
    parts.push({
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { formNumber: { contains: q, mode: 'insensitive' } },
        { pollingStationName: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.EaPortalIssuedFormWhereInput =
    parts.length <= 1 ? (parts[0] ?? {}) : { AND: parts };

  let rows = await prisma.eaPortalIssuedForm.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
    include: {
      electoralArea: { select: { id: true, name: true, region: true } },
      issuedBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
    },
  });

  if (parsed.data.contestOnly || parsed.data.unopposedOnly) {
    const groups = await prisma.eaPortalIssuedForm.groupBy({
      by: ['pollingStationCode', 'position'],
      where,
      _count: { _all: true },
    });
    const contestKeys = new Set(
      groups.filter((g) => g._count._all > 1).map((g) => `${g.pollingStationCode}\t${g.position}`)
    );
    const unopposedKeys = new Set(
      groups.filter((g) => g._count._all === 1).map((g) => `${g.pollingStationCode}\t${g.position}`)
    );
    rows = rows.filter((r) => {
      const k = `${r.pollingStationCode}\t${r.position}`;
      if (parsed.data.contestOnly) return contestKeys.has(k);
      if (parsed.data.unopposedOnly) return unopposedKeys.has(k);
      return true;
    });
  }

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      status: normalizeEaFormStatus(r.status),
    }))
  );
}
