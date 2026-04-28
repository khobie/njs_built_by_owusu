import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const areaId = searchParams.get('areaId');

    const stations = await prisma.pollingStation.findMany({
      where: areaId ? { electoralAreaId: areaId } : undefined,
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(stations);
  } catch (error) {
    console.error('Error fetching polling stations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch polling stations' },
      { status: 500 }
    );
  }
}

