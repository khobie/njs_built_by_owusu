import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertPollingStationBelongsToArea } from '@/lib/candidate-update-validation';
import { recalculateContestStatusForGroup } from '@/lib/contest-status';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';
import { canVet } from '@/lib/roles';

const ALLOWED_POSITIONS = [
  'CHAIRMAN',
  'SECRETARY',
  'ORGANIZER',
  'WOMEN ORGANIZER',
  'YOUTH ORGANIZER',
  'COMMUNICATION OFFICER',
  'ELECTORAL AFFAIRS OFFICER',
] as const;

function normalizeGhanaPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('233') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function normalizePosition(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        electoralArea: true,
        pollingStation: true,
        reports: true,
      },
    });
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json(candidate);
  } catch (error) {
    console.error('Error fetching candidate:', error);
    return NextResponse.json({ error: 'Failed to fetch candidate' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { id } = params;

    const existing = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        electoralAreaId: true,
        pollingStationCode: true,
        position: true,
        phoneNumber: true,
        formNumber: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.formNumber !== undefined) {
      if (typeof body.formNumber !== 'string' || body.formNumber.trim() === '') {
        return NextResponse.json({ error: 'Form number cannot be empty.' }, { status: 400 });
      }
      if (body.formNumber !== existing.formNumber) {
        const dupe = await prisma.candidate.findFirst({
          where: { formNumber: body.formNumber.trim(), NOT: { id } },
        });
        if (dupe) {
          return NextResponse.json({ error: 'Another candidate already uses this form number.' }, { status: 409 });
        }
      }
      updateData.formNumber = body.formNumber.trim();
    }
    if (body.surname !== undefined) {
      if (typeof body.surname !== 'string' || body.surname.trim() === '') {
        return NextResponse.json({ error: 'Surname cannot be empty.' }, { status: 400 });
      }
      updateData.surname = body.surname.trim();
    }
    if (body.firstName !== undefined) {
      if (typeof body.firstName !== 'string' || body.firstName.trim() === '') {
        return NextResponse.json({ error: 'First name cannot be empty.' }, { status: 400 });
      }
      updateData.firstName = body.firstName.trim();
    }
    if (body.middleName !== undefined) {
      if (body.middleName === null || body.middleName === '') updateData.middleName = null;
      else if (typeof body.middleName === 'string') updateData.middleName = body.middleName.trim();
      else return NextResponse.json({ error: 'Invalid middle name.' }, { status: 400 });
    }
    if (body.phoneNumber !== undefined) {
      if (typeof body.phoneNumber !== 'string') {
        return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 });
      }
      const phone = normalizeGhanaPhone(body.phoneNumber);
      if (!/^0\d{9}$/.test(phone)) {
        return NextResponse.json(
          { error: 'Phone number must be exactly 10 digits (e.g. 0241234567).' },
          { status: 400 }
        );
      }
      if (phone !== existing.phoneNumber) {
        const dupe = await prisma.candidate.findFirst({
          where: { phoneNumber: phone, NOT: { id } },
        });
        if (dupe) {
          return NextResponse.json({ error: 'Another candidate already uses this phone number.' }, { status: 409 });
        }
      }
      updateData.phoneNumber = phone;
    }
    if (body.age !== undefined) {
      if (body.age === null || body.age === '') updateData.age = null;
      else {
        const n = typeof body.age === 'number' ? body.age : parseInt(String(body.age), 10);
        if (Number.isNaN(n) || n < 18 || n > 120) {
          return NextResponse.json({ error: 'Age must be between 18 and 120, or empty.' }, { status: 400 });
        }
        updateData.age = n;
      }
    }
    if (body.electoralAreaId !== undefined) {
      if (typeof body.electoralAreaId !== 'string' || body.electoralAreaId.trim() === '') {
        return NextResponse.json({ error: 'Electoral area is required.' }, { status: 400 });
      }
      updateData.electoralAreaId = body.electoralAreaId.trim();
    }
    if (body.pollingStationCode !== undefined) {
      if (body.pollingStationCode === null || body.pollingStationCode === '') {
        updateData.pollingStationCode = null;
      } else if (typeof body.pollingStationCode === 'string') {
        updateData.pollingStationCode = body.pollingStationCode.trim();
      } else {
        return NextResponse.json({ error: 'Invalid polling station code.' }, { status: 400 });
      }
    }
    if (body.position !== undefined) {
      if (typeof body.position !== 'string' || body.position.trim() === '') {
        return NextResponse.json({ error: 'Position cannot be empty.' }, { status: 400 });
      }
      const normalized = normalizePosition(body.position);
      if (!(ALLOWED_POSITIONS as readonly string[]).includes(normalized)) {
        return NextResponse.json(
          { error: `Position must be one of: ${ALLOWED_POSITIONS.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.position = normalized;
    }
    if (body.delegateType !== undefined) {
      if (body.delegateType !== 'NEW' && body.delegateType !== 'OLD') {
        return NextResponse.json({ error: 'Delegate type must be NEW or OLD.' }, { status: 400 });
      }
      updateData.delegateType = body.delegateType;
    }
    if (body.comment !== undefined) {
      updateData.comment = body.comment === '' || body.comment === null ? null : String(body.comment);
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.verificationStatus !== undefined) updateData.verificationStatus = body.verificationStatus;

    const nextAreaId =
      typeof updateData.electoralAreaId === 'string' ? updateData.electoralAreaId : existing.electoralAreaId;
    const nextCodeRaw =
      updateData.pollingStationCode !== undefined ? updateData.pollingStationCode : existing.pollingStationCode;
    const nextCode = typeof nextCodeRaw === 'string' && nextCodeRaw.trim() !== '' ? nextCodeRaw.trim() : null;

    if (nextCode) {
      const check = await assertPollingStationBelongsToArea(nextCode, nextAreaId);
      if (!check.ok) {
        return NextResponse.json({ error: check.message }, { status: 400 });
      }
    }

    const candidate = await prisma.candidate.update({
      where: { id },
      data: updateData,
      include: {
        electoralArea: true,
        pollingStation: true,
      },
    });

    const relevantChanged =
      updateData.status !== undefined ||
      updateData.pollingStationCode !== undefined ||
      updateData.position !== undefined;

    if (relevantChanged) {
      // Recalculate both old and new slots in case an edit moved the record.
      await recalculateContestStatusForGroup(existing.pollingStationCode, existing.position);
      await recalculateContestStatusForGroup(candidate.pollingStationCode, candidate.position);
    }

    return NextResponse.json(candidate);
  } catch (error) {
    console.error('Error updating candidate:', error);
    return NextResponse.json({ error: 'Failed to update candidate' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canVet(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        pollingStationCode: true,
        position: true,
        electoralArea: { select: { code: true } },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    if (user.role === 'VETTING_PANEL') {
      const allowed = await getSessionAreaCodes(user.id);
      const areaCode = candidate.electoralArea?.code;
      if (!areaCode || !allowed.includes(areaCode)) {
        return NextResponse.json({ error: 'Forbidden for this electoral area' }, { status: 403 });
      }
    }

    await prisma.candidate.delete({
      where: { id },
    });

    await recalculateContestStatusForGroup(candidate.pollingStationCode, candidate.position);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting candidate:', error);
    return NextResponse.json({ error: 'Failed to delete candidate' }, { status: 500 });
  }
}
