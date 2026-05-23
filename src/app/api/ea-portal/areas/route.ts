import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { areaFilterForScope, logEaPortalActivity } from '@/lib/ea-portal-access';
import { syncEaPortalAreasFromDelegate } from '@/lib/ea-portal-areas-sync';
import { KOFORIDUA_ELECTORAL_AREAS } from '@/lib/koforidua-electoral-areas';
import { sortByKoforiduaAreaOrder } from '@/lib/koforidua-electoral-areas';
import { syncKoforiduaElectoralAreas } from '@/lib/koforidua-electoral-areas-sync';
import { requireEaPortal } from '@/lib/ea-portal-session';

const createSchema = z.object({
  name: z.string().min(1),
  constituency: z.string().min(1),
  district: z.string().min(1),
  region: z.string().min(1),
  delegateAreaCode: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireEaPortal(request);
    if (!gate.ok) return gate.response;

    const where = areaFilterForScope(gate.scope);

    if (gate.full) {
      const portalCount = await prisma.eaPortalArea.count({ where });
      if (portalCount < KOFORIDUA_ELECTORAL_AREAS.length) {
        const sync = await syncKoforiduaElectoralAreas('Ghana');
        if (sync.errors.length > 0) {
          console.warn('Koforidua area sync partial errors:', sync.errors);
        }
        if (portalCount === 0) {
          const delegateCount = await prisma.electoralArea.count();
          if (delegateCount > 0) {
            await syncEaPortalAreasFromDelegate('Ghana');
          }
        }
      }
    }

    const areas = await prisma.eaPortalArea.findMany({
      where,
      include: {
        _count: { select: { records: true, userLinks: true } },
      },
    });
    return NextResponse.json(sortByKoforiduaAreaOrder(areas));
  } catch (e) {
    console.error('GET /api/ea-portal/areas failed:', e);
    const message = e instanceof Error ? e.message : 'Failed to load electoral areas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) return NextResponse.json({ error: 'Only full portal admins can create areas.' }, { status: 403 });

  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const delegateAreaCode =
      data.delegateAreaCode && data.delegateAreaCode.trim() !== ''
        ? data.delegateAreaCode.trim()
        : null;

    const created = await prisma.eaPortalArea.create({
      data: {
        name: data.name.trim(),
        constituency: data.constituency.trim(),
        district: data.district.trim(),
        region: data.region.trim(),
        delegateAreaCode,
      },
    });
    await logEaPortalActivity({
      action: 'AREA_CREATE',
      actorUserId: gate.user.id,
      areaId: created.id,
      details: created.name,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to create area' }, { status: 500 });
  }
}
