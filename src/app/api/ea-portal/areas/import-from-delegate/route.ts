import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logEaPortalActivity } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';

const bodySchema = z
  .object({
    /** Required EaPortalArea field; defaults to Ghana if omitted or empty. */
    region: z.string().optional(),
  })
  .optional();

/**
 * Create EaPortalArea rows from delegate `electoral_areas` (name + code).
 * Skips delegate areas that already have a portal row with the same `delegateAreaCode`.
 */
export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) {
    return NextResponse.json({ error: 'Only full portal admins can load electoral areas.' }, { status: 403 });
  }

  let regionDefault = 'Ghana';
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.parse(raw);
    const r = parsed?.region?.trim();
    if (r) regionDefault = r;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.errors }, { status: 400 });
    }
  }

  const delegates = await prisma.electoralArea.findMany({ orderBy: { name: 'asc' } });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const d of delegates) {
    const linked = await prisma.eaPortalArea.findFirst({
      where: { delegateAreaCode: d.code },
      select: { id: true },
    });
    if (linked) {
      skipped++;
      continue;
    }

    try {
      await prisma.eaPortalArea.create({
        data: {
          name: d.name,
          constituency: d.name,
          district: d.name,
          region: regionDefault,
          delegateAreaCode: d.code,
        },
      });
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${d.code}: ${msg}`);
    }
  }

  await logEaPortalActivity({
    action: 'AREAS_LOAD_DELEGATE',
    actorUserId: gate.user.id,
    details: `${created} created, ${skipped} already linked`,
  });

  return NextResponse.json({
    created,
    skipped,
    totalDelegateAreas: delegates.length,
    errors,
  });
}
