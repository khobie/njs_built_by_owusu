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
  normalizeEaVoterId,
} from '@/lib/ea-portal-form-constants';
import { canIssueEaForms, canVetEaDelegates, formsVisibleWhere, logEaPortalActivity } from '@/lib/ea-portal-access';
import { findDuplicateDelegate } from '@/lib/ea-portal-delegate';
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
  position: z.string().min(1).optional(),
  formNumber: formNumberSchema.optional(),
  delegateType: z.enum(['NEW', 'OLD']).optional(),
  comment: z.string().optional().nullable(),
  status: z.enum(EA_FORM_STATUSES).optional(),
  issuedAt: z.string().optional(),
  voterId: z.string().optional().nullable(),
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
      verifiedBy: { select: { id: true, name: true, email: true } },
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
  if (!canIssueEaForms(gate.user.role) && !canVetEaDelegates(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to edit delegates.' }, { status: 403 });
  }

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

    if (body.voterId !== undefined) {
      const voterId = body.voterId ? normalizeEaVoterId(body.voterId) : null;
      if (voterId && voterId.length > 20) {
        return NextResponse.json({ error: 'Voter ID is too long (max 20 characters).' }, { status: 400 });
      }
    }
    const dup = await findDuplicateDelegate({
      electoralAreaId: nextAreaId,
      position: nextPosition,
      phone: nextPhone,
      excludeId: existing.id,
    });
    if (dup) {
      return NextResponse.json(
        {
          error:
            'Another delegate already uses this electoral area, position, and phone. Update that record instead.',
          existingId: dup.id,
        },
        { status: 409 }
      );
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
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(body.formNumber !== undefined ? { formNumber: body.formNumber.trim() } : {}),
        ...(body.delegateType !== undefined ? { delegateType: body.delegateType } : {}),
        ...(body.comment !== undefined ? { comment: body.comment?.trim() || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.issuedAt !== undefined ? { issuedAt: new Date(body.issuedAt) } : {}),
        ...(body.voterId !== undefined
          ? { voterId: body.voterId ? normalizeEaVoterId(body.voterId) : null }
          : {}),
      },
      include: {
        electoralArea: { select: { id: true, name: true, region: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logEaPortalActivity({
      action: 'DELEGATE_UPDATE',
      actorUserId: gate.user.id,
      areaId: updated.electoralAreaId,
      formId: updated.id,
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
        { error: 'Duplicate delegate for electoral area, position, and phone.' },
        { status: 409 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}
