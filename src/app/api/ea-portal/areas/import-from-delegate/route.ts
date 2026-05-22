import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logEaPortalActivity } from '@/lib/ea-portal-access';
import { syncEaPortalAreasFromDelegate } from '@/lib/ea-portal-areas-sync';
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

  const result = await syncEaPortalAreasFromDelegate(regionDefault);

  await logEaPortalActivity({
    action: 'AREAS_LOAD_DELEGATE',
    actorUserId: gate.user.id,
    details: `${result.created} created, ${result.skipped} already linked`,
  });

  return NextResponse.json(result);
}
