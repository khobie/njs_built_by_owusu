import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canIssueEaForms } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';

/** Search polling-station Candidates for import into EA portal (does not modify Candidate rows). */
export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canIssueEaForms(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to import delegates.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const electoralAreaId = (searchParams.get('electoralAreaId') || '').trim();
  const pollingStationCode = (searchParams.get('pollingStationCode') || '').trim();

  if (q.length < 2 && !pollingStationCode) {
    return NextResponse.json([]);
  }

  const parts: Prisma.CandidateWhereInput[] = [];

  if (q.length >= 2) {
    parts.push({
      OR: [
        { surname: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { formNumber: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (electoralAreaId) {
    const portal = await prisma.eaPortalArea.findUnique({
      where: { id: electoralAreaId },
      select: { delegateAreaCode: true },
    });
    if (portal?.delegateAreaCode) {
      const dea = await prisma.electoralArea.findUnique({
        where: { code: portal.delegateAreaCode },
        select: { id: true },
      });
      if (dea) parts.push({ electoralAreaId: dea.id });
    }
  }

  if (pollingStationCode) {
    parts.push({ pollingStationCode });
  }

  const where: Prisma.CandidateWhereInput =
    parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { AND: parts };

  const rows = await prisma.candidate.findMany({
    where,
    take: 30,
    orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      formNumber: true,
      surname: true,
      firstName: true,
      middleName: true,
      phoneNumber: true,
      delegateType: true,
      position: true,
      pollingStationCode: true,
      pollingStation: { select: { name: true } },
      electoralArea: { select: { name: true, code: true } },
    },
  });

  return NextResponse.json(
    rows.map((c) => ({
      id: c.id,
      formNumber: c.formNumber,
      surname: c.surname,
      firstName: c.firstName,
      middleName: c.middleName,
      phone: c.phoneNumber,
      delegateType: c.delegateType,
      position: c.position,
      pollingStationCode: c.pollingStationCode,
      pollingStationName: c.pollingStation?.name ?? null,
      electoralAreaName: c.electoralArea.name,
    }))
  );
}
