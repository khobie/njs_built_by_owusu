import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildEaFormFullName,
  isEaFormDelegateType,
  isEaFormPosition,
  normalizeEaFormPhone,
} from '@/lib/ea-portal-form-constants';
import { formsVisibleWhere, logEaPortalActivity } from '@/lib/ea-portal-access';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

const formNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,6}$/, 'Form number must be 1–6 letters or digits (e.g. 1A12E7).');

const patchSchema = z.object({
  surname: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  middleName: z.string().optional().nullable(),
  phone: z.string().min(3).optional(),
  electoralAreaId: z.string().min(1).optional(),
  pollingStationCode: z.string().optional().nullable(),
  pollingStationName: z.string().optional().nullable(),
  position: z.string().min(1).optional(),
  formNumber: formNumberSchema.optional(),
  delegateType: z.enum(['NEW', 'OLD']).optional(),
  comment: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  issuedAt: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const base = formsVisibleWhere(gate.scope);
  const row = await prisma.eaPortalIssuedForm.findFirst({
    where: {
      id: params.id,
      ...(Object.keys(base).length > 0 ? base : {}),
    },
    include: {
      electoralArea: { select: { id: true, name: true, region: true, district: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const base = formsVisibleWhere(gate.scope);
  const existing = await prisma.eaPortalIssuedForm.findFirst({
    where: { id: params.id, ...(Object.keys(base).length > 0 ? base : {}) },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = patchSchema.parse(await request.json());

    const nextAreaId = body.electoralAreaId ?? existing.electoralAreaId;
    const nextPosition = body.position ?? existing.position;
    const nextPhone = body.phone !== undefined ? normalizeEaFormPhone(body.phone) : existing.phone;

    const nextSurname = body.surname !== undefined ? body.surname.trim() : existing.surname;
    const nextFirst = body.firstName !== undefined ? body.firstName.trim() : existing.firstName;
    const nextMiddle =
      body.middleName !== undefined ? body.middleName?.trim() || null : existing.middleName;
    const nextFull = buildEaFormFullName(nextFirst, nextMiddle, nextSurname);

    if (body.position !== undefined && !isEaFormPosition(body.position)) {
      return NextResponse.json({ error: 'Invalid position.' }, { status: 400 });
    }
    if (body.delegateType !== undefined && !isEaFormDelegateType(body.delegateType)) {
      return NextResponse.json({ error: 'Invalid delegate type.' }, { status: 400 });
    }
    if (body.electoralAreaId !== undefined && !assertAreaIdAllowed(body.electoralAreaId, gate.scope)) {
      return NextResponse.json({ error: 'Forbidden for this electoral area.' }, { status: 403 });
    }
    if (body.phone !== undefined && !nextPhone) {
      return NextResponse.json({ error: 'Phone is required.' }, { status: 400 });
    }
    if (!nextFull) {
      return NextResponse.json({ error: 'Name fields are required.' }, { status: 400 });
    }

    if (
      nextAreaId !== existing.electoralAreaId ||
      nextPosition !== existing.position ||
      nextPhone !== existing.phone
    ) {
      const clash = await prisma.eaPortalIssuedForm.findFirst({
        where: {
          electoralAreaId: nextAreaId,
          position: nextPosition,
          phone: nextPhone,
          NOT: { id: existing.id },
        },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          {
            error: 'Applicant already exists for this position in this Electoral Area.',
          },
          { status: 409 },
        );
      }
    }

    if (body.formNumber !== undefined) {
      const fn = body.formNumber.trim();
      const taken = await prisma.eaPortalIssuedForm.findFirst({
        where: { formNumber: fn, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: 'Form number already in use.' }, { status: 409 });
      }
    }

    const updated = await prisma.eaPortalIssuedForm.update({
      where: { id: existing.id },
      data: {
        ...(body.surname !== undefined ? { surname: nextSurname } : {}),
        ...(body.firstName !== undefined ? { firstName: nextFirst } : {}),
        ...(body.middleName !== undefined ? { middleName: nextMiddle } : {}),
        fullName: nextFull,
        ...(body.phone !== undefined ? { phone: nextPhone } : {}),
        ...(body.electoralAreaId !== undefined ? { electoralAreaId: body.electoralAreaId } : {}),
        ...(body.pollingStationCode !== undefined
          ? { pollingStationCode: body.pollingStationCode?.trim() || null }
          : {}),
        ...(body.pollingStationName !== undefined
          ? { pollingStationName: body.pollingStationName?.trim() || null }
          : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(body.formNumber !== undefined ? { formNumber: body.formNumber.trim() } : {}),
        ...(body.delegateType !== undefined ? { delegateType: body.delegateType } : {}),
        ...(body.comment !== undefined ? { comment: body.comment?.trim() || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.issuedAt !== undefined ? { issuedAt: new Date(body.issuedAt) } : {}),
      },
      include: {
        electoralArea: { select: { id: true, name: true, region: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logEaPortalActivity({
      action: 'FORM_UPDATE',
      actorUserId: gate.user.id,
      areaId: updated.electoralAreaId,
      details: `${updated.formNumber} · ${updated.fullName}`,
    });

    return NextResponse.json(updated);
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
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}
