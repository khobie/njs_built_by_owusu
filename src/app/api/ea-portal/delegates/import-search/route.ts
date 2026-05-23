import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canIssueEaForms } from '@/lib/ea-portal-access';
import { mapCandidateRowToImportPayload } from '@/lib/ea-delegate-import';
import { requireEaPortal } from '@/lib/ea-portal-session';

const candidateImportSelect = {
  id: true,
  formNumber: true,
  surname: true,
  firstName: true,
  middleName: true,
  phoneNumber: true,
  delegateType: true,
  position: true,
  comment: true,
  age: true,
  status: true,
  verificationStatus: true,
  contestStatus: true,
  pollingStationCode: true,
  createdAt: true,
  pollingStation: { select: { name: true } },
  electoralArea: { select: { name: true, code: true } },
  reports: {
    select: { content: true, reportType: true, authorName: true },
    orderBy: { createdAt: 'desc' as const },
    take: 10,
  },
  vettingQuestions: {
    select: { question: true, notes: true, response: true },
    orderBy: { verifiedAt: 'desc' as const },
    take: 25,
  },
} satisfies Prisma.CandidateSelect;

/** Search polling-station Candidates for import into EA portal (does not modify Candidate rows). */
export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canIssueEaForms(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to import delegates.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const candidateId = (searchParams.get('candidateId') || '').trim();

  if (candidateId) {
    const row = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: candidateImportSelect,
    });
    if (!row) return NextResponse.json({ error: 'Delegate not found.' }, { status: 404 });
    return NextResponse.json(mapCandidateRowToImportPayload(row));
  }

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
        { middleName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { formNumber: { contains: q, mode: 'insensitive' } },
        { comment: { contains: q, mode: 'insensitive' } },
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
    select: candidateImportSelect,
  });

  return NextResponse.json(rows.map(mapCandidateRowToImportPayload));
}
