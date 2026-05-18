import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    const userAreas = user.role === 'VETTING_PANEL' ? await getSessionAreaCodes(user.id) : [];

    let eaPortalAreas: { id: string; name: string; region: string }[] = [];
    if (user.role === 'EA_OFFICER') {
      const links = await prisma.userEaPortalArea.findMany({
        where: { userId: user.id },
        select: { area: { select: { id: true, name: true, region: true } } },
      });
      eaPortalAreas = links.map((l) => l.area);
    }

    return NextResponse.json({
      user,
      userAreas,
      eaPortalAreas,
    });
  } catch (error) {
    console.error('Session check failed:', error);
    return NextResponse.json(
      { error: 'Session check failed' },
      { status: 500 }
    );
  }
}
