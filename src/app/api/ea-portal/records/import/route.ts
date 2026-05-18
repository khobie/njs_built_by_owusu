import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';
import { logEaPortalActivity } from '@/lib/ea-portal-access';

type ImportRow = {
  id?: string;
  full_name?: string;
  fullName?: string;
  phone?: string;
  role?: string;
  electoral_area_id?: string;
  electoralAreaId?: string;
  polling_station_code?: string;
  pollingStationCode?: string;
  polling_station_name?: string;
  pollingStationName?: string;
  notes?: string;
};

/**
 * Import / migrate: rows with `id` update in place; rows without `id` create new records.
 * No duplicate rows — always UPDATE by id when present.
 */
export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) return NextResponse.json({ error: 'Import requires full portal access.' }, { status: 403 });

  try {
    const body = await request.json();
    const rows = (body.rows ?? body.records ?? []) as ImportRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    let updated = 0;
    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const fullName = (r.full_name || r.fullName || '').trim();
      const phone = (r.phone || '').trim();
      const role = (r.role || '').trim();
      const notes = (r.notes || '').trim() || null;
      const pollingStationCode = (r.polling_station_code || r.pollingStationCode || '').trim() || null;
      const pollingStationName = (r.polling_station_name || r.pollingStationName || '').trim() || null;
      const rawArea = (r.electoral_area_id || r.electoralAreaId || '').trim();
      const electoralAreaId = rawArea === '' ? null : rawArea;

      if (!fullName || !phone || !role) {
        errors.push(`Row ${i + 1}: missing full name, phone, or role`);
        continue;
      }

      if (electoralAreaId && !assertAreaIdAllowed(electoralAreaId, gate.scope)) {
        errors.push(`Row ${i + 1}: area not allowed`);
        continue;
      }

      const id = (r.id || '').trim();

      try {
        if (id) {
          const ex = await prisma.eaPortalRecord.findUnique({ where: { id } });
          if (!ex) {
            errors.push(`Row ${i + 1}: id ${id} not found`);
            continue;
          }
          await prisma.eaPortalRecord.update({
            where: { id },
            data: {
              fullName,
              phone,
              role,
              electoralAreaId,
              pollingStationCode,
              pollingStationName,
              notes,
            },
          });
          updated++;
        } else {
          await prisma.eaPortalRecord.create({
            data: {
              fullName,
              phone,
              role,
              electoralAreaId,
              pollingStationCode,
              pollingStationName,
              notes,
            },
          });
          created++;
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }

    await logEaPortalActivity({
      action: 'IMPORT',
      actorUserId: gate.user.id,
      details: JSON.stringify({ updated, created, errors: errors.length }),
    });

    return NextResponse.json({ updated, created, errors }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
