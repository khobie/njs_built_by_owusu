import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logEaPortalActivity, recordsVisibleWhere } from '@/lib/ea-portal-access';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

const patchSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  electoralAreaId: z.string().optional().nullable(),
  pollingStationCode: z.string().optional().nullable(),
  pollingStationName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

async function recordVisible(id: string, scope: string[] | null) {
  const base = recordsVisibleWhere(scope);
  return prisma.eaPortalRecord.findFirst({
    where: { AND: [base, { id }] },
    include: { electoralArea: true },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  const row = await recordVisible(params.id, gate.scope);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const existing = await recordVisible(params.id, gate.scope);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = await request.json();
    const data = patchSchema.parse(body);
    const electoralAreaId =
      data.electoralAreaId === undefined
        ? undefined
        : data.electoralAreaId && data.electoralAreaId.trim() !== ''
          ? data.electoralAreaId.trim()
          : null;

    if (electoralAreaId !== undefined && electoralAreaId && !assertAreaIdAllowed(electoralAreaId, gate.scope)) {
      return NextResponse.json({ error: 'Cannot assign to this electoral area.' }, { status: 403 });
    }

    const updated = await prisma.eaPortalRecord.update({
      where: { id: params.id },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone.trim() } : {}),
        ...(data.role !== undefined ? { role: data.role.trim() } : {}),
        ...(electoralAreaId !== undefined ? { electoralAreaId } : {}),
        ...(data.pollingStationCode !== undefined
          ? { pollingStationCode: data.pollingStationCode?.trim() || null }
          : {}),
        ...(data.pollingStationName !== undefined
          ? { pollingStationName: data.pollingStationName?.trim() || null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      },
      include: { electoralArea: true },
    });
    await logEaPortalActivity({
      action: 'RECORD_UPDATE',
      actorUserId: gate.user.id,
      recordId: updated.id,
      areaId: updated.electoralAreaId,
      details: `${existing.fullName} → ${updated.fullName}`,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) return NextResponse.json({ error: 'Only full portal admins can delete records.' }, { status: 403 });

  const existing = await recordVisible(params.id, gate.scope);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.eaPortalRecord.delete({ where: { id: params.id } });
  await logEaPortalActivity({
    action: 'RECORD_DELETE',
    actorUserId: gate.user.id,
    details: existing.fullName,
  });
  return NextResponse.json({ success: true });
}
