import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  EA_FORM_STATUSES,
  buildEaFormFullName,
  isEaFormDelegateType,
  isEaFormPosition,
  normalizeEaFormPhone,
} from '@/lib/ea-portal-form-constants';
import { formsVisibleWhere, logEaPortalActivity } from '@/lib/ea-portal-access';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

const listQuery = z.object({
  electoralAreaId: z.string().optional(),
  position: z.string().optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  delegateType: z.enum(['NEW', 'OLD']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
});

const formNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,6}$/, 'Form number must be 1–6 letters or digits (e.g. 1A12E7).');

const postSchema = z.object({
  surname: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional().nullable(),
  phone: z.string().min(3),
  electoralAreaId: z.string().min(1),
  pollingStationCode: z.string().optional().nullable(),
  pollingStationName: z.string().optional().nullable(),
  position: z.string().min(1),
  formNumber: formNumberSchema,
  delegateType: z.enum(['NEW', 'OLD']),
  comment: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  issuedAt: z.string().optional(),
});

function buildListWhere(
  gateScope: string[] | null,
  parsed: z.infer<typeof listQuery>
): Prisma.EaPortalIssuedFormWhereInput {
  const parts: Prisma.EaPortalIssuedFormWhereInput[] = [];

  const scope = formsVisibleWhere(gateScope);
  if (Object.keys(scope).length > 0) parts.push(scope);

  if (parsed.electoralAreaId) parts.push({ electoralAreaId: parsed.electoralAreaId });
  if (parsed.position) parts.push({ position: parsed.position });
  if (parsed.status) parts.push({ status: parsed.status });
  if (parsed.delegateType) parts.push({ delegateType: parsed.delegateType });

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

  const where = buildListWhere(gate.scope, parsed.data);
  const rows = await prisma.eaPortalIssuedForm.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    take: 2000,
    include: {
      electoralArea: { select: { id: true, name: true, region: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

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

    const dup = await prisma.eaPortalIssuedForm.findFirst({
      where: {
        electoralAreaId: body.electoralAreaId,
        position: body.position,
        phone,
      },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        {
          error: 'Applicant already exists for this position in this Electoral Area.',
        },
        { status: 409 },
      );
    }

    const formNum = body.formNumber.trim();
    const exists = await prisma.eaPortalIssuedForm.findUnique({
      where: { formNumber: formNum },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: 'Form number already in use.' }, { status: 409 });
    }

    const status = body.status ?? 'PENDING';
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

    const created = await prisma.eaPortalIssuedForm.create({
      data: {
        surname,
        firstName,
        middleName,
        fullName,
        phone,
        electoralAreaId: body.electoralAreaId,
        pollingStationCode: body.pollingStationCode?.trim() || null,
        pollingStationName: body.pollingStationName?.trim() || null,
        position: body.position,
        formNumber: formNum,
        delegateType: body.delegateType,
        comment: body.comment?.trim() || null,
        status,
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
        { error: 'Applicant already exists for this position in this Electoral Area.' },
        { status: 409 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to issue form' }, { status: 500 });
  }
}
