import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEaPortal } from '@/lib/ea-portal-session';

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const take = Math.min(100, Math.max(1, parseInt(searchParams.get('take') || '50', 10) || 50));

  const rows = await prisma.eaPortalActivity.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      area: { select: { id: true, name: true, region: true } },
      record: { select: { id: true, fullName: true, phone: true } },
    },
  });

  return NextResponse.json(rows);
}
