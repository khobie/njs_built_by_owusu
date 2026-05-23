import { NextRequest, NextResponse } from 'next/server';
import { buildEaPortalReportPayload } from '@/lib/ea-portal-reporting';
import { requireEaPortal } from '@/lib/ea-portal-session';

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const sp = new URL(request.url).searchParams;
  const payload = await buildEaPortalReportPayload(gate.scope, {
    electoralAreaId: sp.get('electoralAreaId') || undefined,
    position: sp.get('position') || undefined,
    delegateType: sp.get('delegateType') || undefined,
    status: sp.get('status') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    q: sp.get('q') || undefined,
    contestOnly: sp.get('contestOnly') === '1',
    unopposedOnly: sp.get('unopposedOnly') === '1',
  });

  return NextResponse.json(payload);
}
