import { NextRequest, NextResponse } from 'next/server';
import { buildEaPortalReportPayload, parseEaReportFiltersFromSearchParams } from '@/lib/ea-portal-reporting';
import { requireEaPortal } from '@/lib/ea-portal-session';

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const sp = new URL(request.url).searchParams;
  const payload = await buildEaPortalReportPayload(
    gate.scope,
    parseEaReportFiltersFromSearchParams(sp)
  );

  return NextResponse.json(payload);
}
