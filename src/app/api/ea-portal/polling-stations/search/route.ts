import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

/**
 * Search delegate `PollingStation` rows (polling_stations DB) for use on EA portal forms.
 * Scoped: optional `eaPortalAreaId` limits to stations under that portal area's `delegateAreaCode`.
 * Full-access users may omit `eaPortalAreaId` to search all stations.
 */
export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const eaPortalAreaId = (searchParams.get('eaPortalAreaId') || '').trim();

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  let electoralAreaFilter: Prisma.PollingStationWhereInput['electoralAreaId'] | undefined;

  if (eaPortalAreaId) {
    if (!assertAreaIdAllowed(eaPortalAreaId, gate.scope)) {
      return NextResponse.json({ error: 'Forbidden for this electoral area' }, { status: 403 });
    }
    const portalArea = await prisma.eaPortalArea.findUnique({
      where: { id: eaPortalAreaId },
      select: { delegateAreaCode: true },
    });
    if (!portalArea?.delegateAreaCode) {
      return NextResponse.json([]);
    }
    const delegateEA = await prisma.electoralArea.findUnique({
      where: { code: portalArea.delegateAreaCode },
      select: { id: true },
    });
    if (!delegateEA) {
      return NextResponse.json([]);
    }
    electoralAreaFilter = delegateEA.id;
  } else if (gate.scope !== null) {
    const links = await prisma.eaPortalArea.findMany({
      where: { id: { in: gate.scope } },
      select: { delegateAreaCode: true },
    });
    const codes = Array.from(
      new Set(links.map((l) => l.delegateAreaCode).filter((c): c is string => Boolean(c)))
    );
    if (codes.length === 0) {
      return NextResponse.json([]);
    }
    const eas = await prisma.electoralArea.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    const ids = eas.map((e) => e.id);
    if (ids.length === 0) {
      return NextResponse.json([]);
    }
    electoralAreaFilter = { in: ids };
  }

  const stationOr: Prisma.PollingStationWhereInput[] = [
    {
      OR: [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
  ];
  if (electoralAreaFilter !== undefined) {
    stationOr.push({ electoralAreaId: electoralAreaFilter });
  }

  const where: Prisma.PollingStationWhereInput = { AND: stationOr };

  const rows = await prisma.pollingStation.findMany({
    where,
    take: 40,
    orderBy: { name: 'asc' },
    select: {
      code: true,
      name: true,
      electoralArea: { select: { name: true, code: true } },
    },
  });

  return NextResponse.json(rows);
}
