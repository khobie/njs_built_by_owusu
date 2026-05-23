import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  EA_FORM_STATUSES,
  buildEaFormFullName,
  EA_FORM_LIST_SELECT,
  isEaFormDelegateType,
  isEaFormPosition,
  isValidEaPassportPhotoDataUrl,
  normalizeEaFormPhone,
  normalizeEaVoterId,
} from '@/lib/ea-portal-form-constants';
import { canIssueEaForms, formsVisibleWhere, logEaPortalActivity } from '@/lib/ea-portal-access';
import {
  findDuplicateDelegate,
  generateEaFormNumber,
  normalizeEaFormStatus,
} from '@/lib/ea-portal-delegate';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

const listQuery = z.object({
  electoralAreaId: z.string().optional(),
  pollingStationCode: z.string().optional(),
  position: z.string().optional(),
  status: z.string().optional(),
  delegateType: z.enum(['NEW', 'OLD']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  contestOnly: z.enum(['1', 'true']).optional(),
});

const formNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,6}$/, 'Form number must be 1–6 letters or digits.');

const postSchema = z.object({
  surname: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional().nullable(),
  phone: z.string().min(3),
  electoralAreaId: z.string().min(1),
  pollingStationCode: z.string().min(1),
  pollingStationName: z.string().min(1),
  position: z.string().min(1),
  formNumber: formNumberSchema.optional(),
  delegateType: z.enum(['NEW', 'OLD']),
  comment: z.string().optional().nullable(),
  status: z.enum(EA_FORM_STATUSES).optional(),
  issuedAt: z.string().optional(),
  sourceCandidateId: z.string().optional().nullable(),
  voterId: z.string().optional().nullable(),
  passportPhoto: z.string().optional().nullable(),
});

async function attachHasPassportPhoto<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, hasPassportPhoto: false }));
  const withPhoto = await prisma.eaPortalIssuedForm.findMany({
    where: { id: { in: rows.map((r) => r.id) }, passportPhoto: { not: null } },
    select: { id: true },
  });
  const photoIds = new Set(withPhoto.map((r) => r.id));
  return rows.map((r) => ({ ...r, hasPassportPhoto: photoIds.has(r.id) }));
}

function buildListWhere(
  gateScope: string[] | null,
  parsed: z.infer<typeof listQuery>
): Prisma.EaPortalIssuedFormWhereInput {
  const parts: Prisma.EaPortalIssuedFormWhereInput[] = [];

  const scope = formsVisibleWhere(gateScope);
  if (Object.keys(scope).length > 0) parts.push(scope);

  if (parsed.electoralAreaId) parts.push({ electoralAreaId: parsed.electoralAreaId });
  if (parsed.pollingStationCode) parts.push({ pollingStationCode: parsed.pollingStationCode });
  if (parsed.position) parts.push({ position: parsed.position });
  if (parsed.delegateType) parts.push({ delegateType: parsed.delegateType });
  if (parsed.status) {
    const st = parsed.status === 'PENDING' ? 'PENDING_VETTING' : parsed.status;
    parts.push({ status: st });
  }

  if (parsed.from || parsed.to) {
    const issuedAt: { gte?: Date; lte?: Date } = {};
    if (parsed.from) issuedAt.gte = new Date(parsed.from);
    if (parsed.to) {
      const end = new Date(parsed.to);
      end.setHours(23, 59, 59, 999);
      issuedAt.lte = end;
    }
    parts.push({ issuedAt });
  }

  if (parsed.q?.trim()) {
    const q = parsed.q.trim();
    parts.push({
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { surname: { contains: q, mode: 'insensitive' } },
        { middleName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { formNumber: { contains: q, mode: 'insensitive' } },
        { voterId: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
        { pollingStationName: { contains: q, mode: 'insensitive' } },
        { comment: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listQuery.safeParse(sp);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });
  }

  let where = buildListWhere(gate.scope, parsed.data);

  if (parsed.data.contestOnly) {
    const groups = await prisma.eaPortalIssuedForm.groupBy({
      by: ['pollingStationCode', 'position'],
      where,
      _count: { _all: true },
    });
    const keys = new Set(
      groups.filter((g) => g._count._all > 1).map((g) => `${g.pollingStationCode}\t${g.position}`)
    );
    const rows = await prisma.eaPortalIssuedForm.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 2000,
      select: {
        ...EA_FORM_LIST_SELECT,
        electoralArea: { select: { id: true, name: true, region: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
      },
    });
    const filtered = rows.filter((r) => keys.has(`${r.pollingStationCode}\t${r.position}`));
    const withFlags = await attachHasPassportPhoto(
      filtered.map((r) => ({ ...r, status: normalizeEaFormStatus(r.status) }))
    );
    return NextResponse.json(withFlags);
  }

  const rows = await prisma.eaPortalIssuedForm.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    take: 2000,
    select: {
      ...EA_FORM_LIST_SELECT,
      electoralArea: { select: { id: true, name: true, region: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
    },
  });
  const withFlags = await attachHasPassportPhoto(
    rows.map((r) => ({ ...r, status: normalizeEaFormStatus(r.status) }))
  );
  return NextResponse.json(withFlags);
}

export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canIssueEaForms(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to issue forms.' }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await request.json());
    if (!isEaFormPosition(body.position)) {
      return NextResponse.json({ error: 'Invalid position.' }, { status: 400 });
    }
    if (!isEaFormDelegateType(body.delegateType)) {
      return NextResponse.json({ error: 'Invalid delegate type.' }, { status: 400 });
    }
    if (!assertAreaIdAllowed(body.electoralAreaId, gate.scope)) {
      return NextResponse.json({ error: 'Forbidden for this electoral area.' }, { status: 403 });
    }

    const phone = normalizeEaFormPhone(body.phone);
    if (!phone) {
      return NextResponse.json({ error: 'Phone is required.' }, { status: 400 });
    }

    const pollingStationCode = body.pollingStationCode.trim();
    const pollingStationName = body.pollingStationName.trim();

    const dup = await findDuplicateDelegate({
      pollingStationCode,
      position: body.position,
      phone,
    });
    if (dup) {
      return NextResponse.json(
        {
          error:
            'A delegate already exists for this polling station, position, and phone. Edit the existing record instead.',
          existingId: dup.id,
        },
        { status: 409 }
      );
    }

    const formNum = body.formNumber?.trim() || (await generateEaFormNumber());
    const exists = await prisma.eaPortalIssuedForm.findUnique({
      where: { formNumber: formNum },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: 'Form number already in use.' }, { status: 409 });
    }

    const status = body.status ?? 'ISSUED';
    if (!EA_FORM_STATUSES.includes(status as (typeof EA_FORM_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const surname = body.surname.trim();
    const firstName = body.firstName.trim();
    const middleName = body.middleName?.trim() || null;
    const fullName = buildEaFormFullName(firstName, middleName, surname);
    if (!fullName) {
      return NextResponse.json({ error: 'Name fields are required.' }, { status: 400 });
    }

    const voterId = body.voterId ? normalizeEaVoterId(body.voterId) : null;
    const passportPhoto = body.passportPhoto?.trim() || null;
    if (voterId && voterId.length > 20) {
      return NextResponse.json({ error: 'Voter ID is too long (max 20 characters).' }, { status: 400 });
    }
    if (!isValidEaPassportPhotoDataUrl(passportPhoto)) {
      return NextResponse.json({ error: 'Invalid passport photo.' }, { status: 400 });
    }

    const created = await prisma.eaPortalIssuedForm.create({
      data: {
        surname,
        firstName,
        middleName,
        fullName,
        phone,
        voterId: voterId || null,
        passportPhoto,
        electoralAreaId: body.electoralAreaId,
        pollingStationCode,
        pollingStationName,
        position: body.position,
        formNumber: formNum,
        delegateType: body.delegateType,
        comment: body.comment?.trim() || null,
        status,
        sourceCandidateId: body.sourceCandidateId?.trim() || null,
        issuedByUserId: gate.user.id,
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
      },
      include: {
        electoralArea: { select: { id: true, name: true, region: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logEaPortalActivity({
      action: 'FORM_ISSUE',
      actorUserId: gate.user.id,
      areaId: body.electoralAreaId,
      formId: created.id,
      details: `${created.formNumber} · ${created.fullName} · ${created.position}`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | undefined) ?? [];
      if (target.some((t) => String(t).includes('formNumber'))) {
        return NextResponse.json({ error: 'Form number already in use.' }, { status: 409 });
      }
      return NextResponse.json(
        {
          error:
            'Duplicate delegate for this polling station, position, and phone. Update the existing record.',
        },
        { status: 409 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to issue form' }, { status: 500 });
  }
}
