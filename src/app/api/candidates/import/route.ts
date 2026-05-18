import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { canIssueForms } from '@/lib/roles';
import { FORM_NUMBER_MAX_LENGTH } from '@/lib/form-number';

interface ImportCandidate {
  formNumber?: string;
  surname?: string;
  firstName?: string;
  firstname?: string;
  middleName?: string;
  middlename?: string;
  fullName?: string;
  phoneNumber?: string;
  phone?: string;
  age?: string;
  electoralAreaId?: string;
  electoralArea?: string;
  pollingStationCode?: string;
  station?: string;
  position?: string;
  delegateType?: string;
  status?: string;
  comment?: string;
}

function parseFullName(fullName: string): { surname: string; firstName: string; middleName?: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { surname: parts[0], firstName: parts[0] };
  }
  if (parts.length === 2) {
    return { surname: parts[1], firstName: parts[0] };
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    surname: parts[parts.length - 1],
  };
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 9) {
    return '0' + cleaned;
  }
  return cleaned;
}

function generateFormNumber(serial: number): string {
  if (serial < 1 || serial > 999_999) {
    throw new Error(`Form number serial out of range (1–999999): ${serial}`);
  }
  return String(serial).padStart(FORM_NUMBER_MAX_LENGTH, '0');
}

function pickImportFormNumber(candidate: ImportCandidate): string {
  const c = candidate as Record<string, unknown>;
  const raw =
    c.formNumber ??
    c.formnumber ??
    c['Form Number'] ??
    c['form_number'] ??
    c['form number'];
  return String(raw ?? '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canIssueForms(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { candidates }: { candidates: ImportCandidate[] } = body;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json(
        { error: 'No candidates provided' },
        { status: 400 }
      );
    }

    // Fetch all electoral areas for name-to-id mapping
    const electoralAreas = await prisma.electoralArea.findMany({
      select: { id: true, name: true },
    });
    const areaNameMap = new Map(
      electoralAreas.map((a) => [a.name.toUpperCase().trim(), a.id])
    );

    // Fetch all polling stations for name-to-code mapping
    const pollingStations = await prisma.pollingStation.findMany({
      select: { code: true, name: true, electoralAreaId: true },
    });
    const stationNameMap = new Map(
      pollingStations.map((s) => [s.name.toUpperCase().trim(), s.code])
    );

    const candidateCount = await prisma.candidate.count();

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        // Extract fields with multiple possible column names
        const surname = (candidate.surname || '').trim();
        const firstName = (candidate.firstName || candidate.firstname || '').trim();
        const middleName = (candidate.middleName || candidate.middlename || '').trim() || undefined;
        const phone = normalizePhone(candidate.phone || candidate.phoneNumber || '');
        const age = candidate.age ? parseInt(candidate.age, 10) : null;
        const position = (candidate.position || '').trim().toUpperCase();
        const stationName = (candidate.station || '').trim();
        const electoralAreaName = (candidate.electoralArea || '').trim();

        // Map status to delegateType
        const statusValue = (candidate.status || candidate.delegateType || '').toLowerCase();
        const delegateType = statusValue.includes('old') ? 'OLD' : 'NEW';

        // Validate required fields
        if (!surname || !firstName || !phone) {
          results.skipped++;
          results.errors.push(`Row ${i + 1}: Skipped - Missing required fields (surname, firstname, or phone)`);
          continue;
        }

        // Check for duplicates by phone
        const existing = await prisma.candidate.findFirst({
          where: { phoneNumber: phone },
        });

        if (existing) {
          results.skipped++;
          results.errors.push(`Row ${i + 1}: Skipped - Duplicate phone number ${phone} for ${surname} ${firstName}`);
          continue;
        }

        // Look up electoral area by name
        let electoralAreaId = candidate.electoralAreaId;
        if (!electoralAreaId && electoralAreaName) {
          electoralAreaId = areaNameMap.get(electoralAreaName.toUpperCase());
        }

        if (!electoralAreaId) {
          results.skipped++;
          results.errors.push(`Row ${i + 1}: Skipped - Electoral area "${electoralAreaName}" not found for ${surname} ${firstName}`);
          continue;
        }

        // Try to find polling station by name (optional - can be assigned later)
        let pollingStationCode: string | undefined = candidate.pollingStationCode;
        if (!pollingStationCode && stationName) {
          pollingStationCode = stationNameMap.get(stationName.toUpperCase());
        }

        let formNumber = pickImportFormNumber(candidate);
        if (!formNumber) {
          const serial = candidateCount + results.imported + 1;
          try {
            formNumber = generateFormNumber(serial);
          } catch (e) {
            results.skipped++;
            results.errors.push(
              `Row ${i + 1}: Cannot auto-assign form number (${e instanceof Error ? e.message : 'limit reached'})`
            );
            continue;
          }
        } else if (formNumber.length > FORM_NUMBER_MAX_LENGTH) {
          results.skipped++;
          results.errors.push(
            `Row ${i + 1}: Form number must be at most ${FORM_NUMBER_MAX_LENGTH} characters`
          );
          continue;
        }

        // Build comment with station info if station wasn't matched
        let comment = candidate.comment || null;
        if (stationName && !pollingStationCode) {
          const stationComment = `Station to assign: ${stationName}`;
          comment = comment ? `${comment} | ${stationComment}` : stationComment;
        }

        await prisma.candidate.create({
          data: {
            formNumber,
            surname,
            firstName,
            middleName: middleName || null,
            phoneNumber: phone,
            age,
            electoralAreaId,
            pollingStationCode: pollingStationCode || null,
            position: position || 'UNKNOWN',
            delegateType,
            comment,
            status: 'IMPORTED',
          },
        });

        results.imported++;
      } catch (err) {
        results.skipped++;
        results.errors.push(`Row ${i + 1}: Error importing ${candidate.surname || 'unknown'}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error importing candidates:', error);
    return NextResponse.json(
      { error: 'Failed to import candidates' },
      { status: 500 }
    );
  }
}

