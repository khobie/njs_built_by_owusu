import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';
import { canIssueForms } from '@/lib/roles';
import { CANONICAL_DELEGATE_POSITIONS } from '@/lib/delegate-positions';
import { FORM_NUMBER_MAX_LENGTH } from '@/lib/form-number';

function normalizeGhanaPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('233') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function normalizePosition(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

const createCandidateSchema = z.object({
  formNumber: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Form number is required')
        .max(
          FORM_NUMBER_MAX_LENGTH,
          `Form number must be at most ${FORM_NUMBER_MAX_LENGTH} characters`
        )
    ),
  surname: z.string().min(1, 'Surname is required'),
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  phoneNumber: z
    .string()
    .transform((v) => normalizeGhanaPhone(v))
    .refine((v) => /^0\d{9}$/.test(v), {
      message: 'Phone number must be a valid Ghana number (10 digits, e.g. 0241234567).',
    }),
  age: z.coerce.number().min(18).max(120).optional(),
  electoralAreaId: z.string().min(1, 'Electoral area is required'),
  pollingStationCode: z
    .union([z.string(), z.null(), z.undefined()])
    .optional()
    .transform((v) => {
      if (v == null || v === '') return null;
      const t = String(v).trim();
      return t === '' ? null : t;
    }),
  position: z
    .string()
    .transform((v) => normalizePosition(v))
    .refine((v) => (CANONICAL_DELEGATE_POSITIONS as readonly string[]).includes(v), {
      message: `Position must be one of: ${CANONICAL_DELEGATE_POSITIONS.join(', ')}`,
    }),
  delegateType: z.enum(['NEW', 'OLD']),
  comment: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const areaId = searchParams.get('areaId') || '';
    const stationCode = searchParams.get('stationCode') || '';
    const status = searchParams.get('status') || '';
    const verificationStatus = searchParams.get('verificationStatus') || '';
    const contestStatus = searchParams.get('contestStatus') || '';
    const delegateType = searchParams.get('delegateType') || '';
    const position = searchParams.get('position') || '';
    const hasErrors = searchParams.get('hasErrors') === 'true';

    const allowedAreaCodes = user.role === 'VETTING_PANEL' ? await getSessionAreaCodes(user.id) : [];
    const areaScopeFilter =
      user.role === 'VETTING_PANEL'
        ? { electoralArea: { code: { in: allowedAreaCodes.length ? allowedAreaCodes : ['__none__'] } } }
        : {};

    const candidates = await prisma.candidate.findMany({
      where: {
        AND: [
          areaScopeFilter,
          search
            ? {
                OR: [
                  { surname: { contains: search } },
                  { firstName: { contains: search } },
                  { formNumber: { contains: search } },
                  { phoneNumber: { contains: search } },
                ],
              }
            : {},
          areaId ? { electoralAreaId: areaId } : {},
          stationCode ? { pollingStationCode: stationCode } : {},
          status ? { status } : {},
          verificationStatus ? { verificationStatus } : {},
          contestStatus ? { contestStatus } : {},
          delegateType === 'NEW' || delegateType === 'OLD' ? { delegateType } : {},
          position ? { position } : {},
          hasErrors
            ? {
                OR: [
                  { position: '' },
                  { position: { notIn: [...CANONICAL_DELEGATE_POSITIONS] } },
                ],
              }
            : {},
        ],
      },
      include: {
        electoralArea: true,
        pollingStation: true,
        reports: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(candidates);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candidates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canIssueForms(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = createCandidateSchema.parse(body);

    const duplicateAtSlot = await prisma.candidate.findFirst({
      where: {
        phoneNumber: validated.phoneNumber,
        position: validated.position,
        electoralAreaId: validated.electoralAreaId,
      },
    });

    if (duplicateAtSlot) {
      return NextResponse.json(
        { error: 'This delegate has already applied for this position in this electoral area.' },
        { status: 409 }
      );
    }

    const existing = await prisma.candidate.findFirst({
      where: {
        OR: [
          { formNumber: validated.formNumber },
          { phoneNumber: validated.phoneNumber },
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Candidate with this form number or phone number already exists' },
        { status: 409 }
      );
    }

    const candidate = await prisma.candidate.create({
      data: {
        ...validated,
        pollingStationCode: validated.pollingStationCode ?? null,
      },
      include: {
        electoralArea: true,
        pollingStation: true,
      },
    });

    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating candidate:', error);
    return NextResponse.json(
      { error: 'Failed to create candidate' },
      { status: 500 }
    );
  }
}

