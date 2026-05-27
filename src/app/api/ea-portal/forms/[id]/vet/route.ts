import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { canVetEaDelegates, formsVisibleWhere, logEaPortalActivity } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';
import { assertEaFormCanVet } from '@/lib/vetting-eligibility';

const bodySchema = z.object({
  action: z.enum(['verify', 'reject', 'return', 'pending']),
  vettingNotes: z.string().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canVetEaDelegates(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to vet delegates.' }, { status: 403 });
  }

  const base = formsVisibleWhere(gate.scope);
  const existing = await prisma.eaPortalIssuedForm.findFirst({
    where: { id: params.id, ...(Object.keys(base).length > 0 ? base : {}) },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = bodySchema.parse(await request.json());
  const notes = body.vettingNotes?.trim() || null;

  const returnGate = assertEaFormCanVet(existing.status, body.action);
  if (!returnGate.ok) {
    return NextResponse.json({ error: returnGate.error }, { status: 400 });
  }

  let status = existing.status;
  let verifiedAt: Date | null = existing.verifiedAt;
  let verifiedByUserId: string | null = existing.verifiedByUserId;
  let returnedAt: Date | null = existing.returnedAt;

  switch (body.action) {
    case 'verify':
      status = 'VERIFIED';
      verifiedAt = new Date();
      verifiedByUserId = gate.user.id;
      break;
    case 'reject':
      status = 'REJECTED';
      verifiedAt = new Date();
      verifiedByUserId = gate.user.id;
      break;
    case 'return':
      status = 'RETURNED';
      returnedAt = new Date();
      break;
    case 'pending':
      status = 'PENDING_VETTING';
      verifiedAt = null;
      verifiedByUserId = null;
      break;
  }

  const updated = await prisma.eaPortalIssuedForm.update({
    where: { id: existing.id },
    data: {
      status,
      vettingNotes: notes ?? existing.vettingNotes,
      verifiedAt,
      verifiedByUserId,
      returnedAt,
    },
    include: {
      electoralArea: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
    },
  });

  await logEaPortalActivity({
    action: `VET_${body.action.toUpperCase()}`,
    actorUserId: gate.user.id,
    areaId: updated.electoralAreaId,
    formId: updated.id,
    details: `${updated.formNumber} · ${updated.fullName}`,
  });

  return NextResponse.json(updated);
}
