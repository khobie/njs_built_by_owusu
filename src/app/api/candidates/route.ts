import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';

function normalizeGhanaPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('233') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

const createCandidateSchema = z.object({
  formNumber: z.string().min(1, 'Form number is required'),
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
  pollingStationCode: z.string().min(1, 'Polling station is required'),
  position: z.string().min(1, 'Position is required'),
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
                  { pollingStationCode: null },
                  { pollingStationCode: '' },
                  { NOT: { pollingStationCode: { not: null } } },
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
    if (!(user.role === 'ADMIN' || user.role === 'FORM_ISSUER')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = createCandidateSchema.parse(body);

    const duplicateAtSlot = await prisma.candidate.findFirst({
      where: {
        phoneNumber: validated.phoneNumber,
        position: validated.position,
        pollingStationCode: validated.pollingStationCode,
      },
    });

    if (duplicateAtSlot) {
      return NextResponse.json(
        { error: 'This delegate has already applied for this position at this polling station.' },
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
      data: validated,
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

