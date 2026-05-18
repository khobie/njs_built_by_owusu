import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logEaPortalActivity, recordsVisibleWhere } from '@/lib/ea-portal-access';
import { assertAreaIdAllowed, requireEaPortal } from '@/lib/ea-portal-session';

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  electoralAreaId: z.string().optional().nullable(),
});

/** Bulk reassignment: updates existing rows only (no duplicates). */
export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  try {
    const json = await request.json();
    const { ids, electoralAreaId: rawArea } = bodySchema.parse(json);
    const electoralAreaId =
      rawArea === undefined || rawArea === null || rawArea.trim() === '' ? null : rawArea.trim();

    if (electoralAreaId && !assertAreaIdAllowed(electoralAreaId, gate.scope)) {
      return NextResponse.json({ error: 'Target electoral area not allowed for this account.' }, { status: 403 });
    }

    const scopeFilter = recordsVisibleWhere(gate.scope);
    const rows = await prisma.eaPortalRecord.findMany({
      where: { AND: [scopeFilter, { id: { in: ids } }] },
      select: { id: true, fullName: true, electoralAreaId: true },
    });

    if (rows.length !== ids.length) {
      return NextResponse.json(
        { error: 'Some records were not found or are outside your access scope.' },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      ids.map((id) =>
        prisma.eaPortalRecord.update({
          where: { id },
          data: { electoralAreaId },
        })
      )
    );

    await logEaPortalActivity({
      action: 'RECORD_REASSIGN_BULK',
      actorUserId: gate.user.id,
      areaId: electoralAreaId,
      details: JSON.stringify({ count: ids.length, ids, electoralAreaId }),
    });

    return NextResponse.json({ updated: ids.length, electoralAreaId });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Reassignment failed' }, { status: 500 });
  }
}
