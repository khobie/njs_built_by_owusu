import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';
import { logEaPortalActivity } from '@/lib/ea-portal-access';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  constituency: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  delegateAreaCode: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  const { id } = params;
  if (!assertAreaIdAllowed(id, gate.scope)) {
    return NextResponse.json({ error: 'Forbidden for this area' }, { status: 403 });
  }

  const area = await prisma.eaPortalArea.findUnique({
    where: { id },
    include: {
      records: { orderBy: { fullName: 'asc' } },
      _count: { select: { records: true } },
    },
  });
  if (!area) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let delegatePollingStations: { code: string; name: string }[] = [];
  if (area.delegateAreaCode) {
    delegatePollingStations = await prisma.pollingStation.findMany({
      where: { electoralArea: { code: area.delegateAreaCode } },
      select: { code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  return NextResponse.json({ ...area, delegatePollingStations });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) return NextResponse.json({ error: 'Only full portal admins can edit areas.' }, { status: 403 });

  const { id } = params;
  if (!assertAreaIdAllowed(id, gate.scope)) {
    return NextResponse.json({ error: 'Forbidden for this area' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = patchSchema.parse(body);
    const delegateAreaCode =
      data.delegateAreaCode === undefined
        ? undefined
        : data.delegateAreaCode && data.delegateAreaCode.trim() !== ''
          ? data.delegateAreaCode.trim()
          : null;

    const updated = await prisma.eaPortalArea.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.constituency !== undefined ? { constituency: data.constituency.trim() } : {}),
        ...(data.district !== undefined ? { district: data.district.trim() } : {}),
        ...(data.region !== undefined ? { region: data.region.trim() } : {}),
        ...(delegateAreaCode !== undefined ? { delegateAreaCode } : {}),
      },
    });
    await logEaPortalActivity({
      action: 'AREA_UPDATE',
      actorUserId: gate.user.id,
      areaId: id,
      details: updated.name,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to update area' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) return NextResponse.json({ error: 'Only full portal admins can delete areas.' }, { status: 403 });

  const { id } = params;
  if (!assertAreaIdAllowed(id, gate.scope)) {
    return NextResponse.json({ error: 'Forbidden for this area' }, { status: 403 });
  }

  await prisma.eaPortalArea.delete({ where: { id } });
  await logEaPortalActivity({
    action: 'AREA_DELETE',
    actorUserId: gate.user.id,
    details: id,
  });
  return NextResponse.json({ success: true });
}
