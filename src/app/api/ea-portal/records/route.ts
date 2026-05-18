import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { logEaPortalActivity, recordsVisibleWhere } from '@/lib/ea-portal-access';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

const createSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  role: z.string().min(1),
  electoralAreaId: z.string().optional().nullable(),
  pollingStationCode: z.string().optional().nullable(),
  pollingStationName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const areaId = searchParams.get('electoralAreaId') || '';
  const unassigned = searchParams.get('unassigned') === '1' || searchParams.get('unassigned') === 'true';
  const role = searchParams.get('role') || '';
  const station = searchParams.get('pollingStation') || '';
  const q = searchParams.get('q') || '';
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const scopeFilter = recordsVisibleWhere(gate.scope);
  const and: Prisma.EaPortalRecordWhereInput[] = [scopeFilter];

  if (unassigned) {
    and.push({ electoralAreaId: null });
  } else if (areaId) {
    if (!assertAreaIdAllowed(areaId, gate.scope)) {
      return NextResponse.json({ error: 'Forbidden for this area' }, { status: 403 });
    }
    and.push({ electoralAreaId: areaId });
  }

  if (role) and.push({ role: { contains: role, mode: 'insensitive' } });
  if (station) {
    and.push({
      OR: [
        { pollingStationCode: { contains: station, mode: 'insensitive' } },
        { pollingStationName: { contains: station, mode: 'insensitive' } },
      ],
    });
  }
  if (q) {
    and.push({
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (from || to) {
    and.push({
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    });
  }

  const records = await prisma.eaPortalRecord.findMany({
    where: { AND: and },
    orderBy: { createdAt: 'desc' },
    include: { electoralArea: true },
    take: 500,
  });

  return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const electoralAreaId =
      data.electoralAreaId && data.electoralAreaId.trim() !== '' ? data.electoralAreaId.trim() : null;

    if (electoralAreaId && !assertAreaIdAllowed(electoralAreaId, gate.scope)) {
      return NextResponse.json({ error: 'Cannot assign to this electoral area.' }, { status: 403 });
    }

    const created = await prisma.eaPortalRecord.create({
      data: {
        fullName: data.fullName.trim(),
        phone: data.phone.trim(),
        role: data.role.trim(),
        electoralAreaId,
        pollingStationCode: data.pollingStationCode?.trim() || null,
        pollingStationName: data.pollingStationName?.trim() || null,
        notes: data.notes?.trim() || null,
      },
      include: { electoralArea: true },
    });
    await logEaPortalActivity({
      action: 'RECORD_CREATE',
      actorUserId: gate.user.id,
      recordId: created.id,
      areaId: electoralAreaId,
      details: created.fullName,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to create record' }, { status: 500 });
  }
}