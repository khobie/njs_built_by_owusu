import { NextRequest, NextResponse } from 'next/server';
import { logEaPortalActivity } from '@/lib/ea-portal-access';
import { syncKoforiduaElectoralAreas } from '@/lib/koforidua-electoral-areas-sync';
import { requireEaPortal } from '@/lib/ea-portal-session';

export const maxDuration = 60;

/**
 * Seed/sync the canonical 34 Koforidua portal + delegate areas (admin only).
 * Call from EA Portal → Areas, not on every page load.
 */
export async function POST(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!gate.full) {
    return NextResponse.json({ error: 'Only full portal admins can sync areas.' }, { status: 403 });
  }

  try {
    let region = 'Ghana';
    try {
      const body = await request.json().catch(() => ({}));
      if (body?.region && String(body.region).trim()) region = String(body.region).trim();
    } catch {
      /* empty body ok */
    }

    const result = await syncKoforiduaElectoralAreas(region);

    await logEaPortalActivity({
      action: 'AREAS_SYNC_KOFORIDUA',
      actorUserId: gate.user.id,
      details: `delegate=${result.delegateUpserted} portal+${result.portalCreated} updated=${result.portalUpdated}`,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error('POST /api/ea-portal/areas/sync-koforidua failed:', e);
    const message = e instanceof Error ? e.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
