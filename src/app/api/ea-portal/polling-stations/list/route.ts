import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

/** Full polling station list for dropdown (name label, code value). */
export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const eaPortalAreaId = (new URL(request.url).searchParams.get('eaPortalAreaId') || '').trim();
  if (!eaPortalAreaId) {
    return NextResponse.json({ error: 'eaPortalAreaId is required' }, { status: 400 });
  }
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

  const where: Prisma.PollingStationWhereInput = { electoralAreaId: delegateEA.id };

  const rows = await prisma.pollingStation.findMany({
    where,
    orderBy: { name: 'asc' },
    select: { code: true, name: true },
  });

  return NextResponse.json(rows);
}
