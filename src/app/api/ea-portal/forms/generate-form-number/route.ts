import { NextRequest, NextResponse } from 'next/server';
import { canIssueEaForms } from '@/lib/ea-portal-access';
import { generateEaFormNumber } from '@/lib/ea-portal-delegate';
import { requireEaPortal } from '@/lib/ea-portal-session';

/** Preview the next auto-generated form number (reserved on issue via POST). */
export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;
  if (!canIssueEaForms(gate.user.role)) {
    return NextResponse.json({ error: 'Not allowed to issue forms.' }, { status: 403 });
  }

  const formNumber = await generateEaFormNumber();
  return NextResponse.json({ formNumber });
}
