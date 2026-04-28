import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const areas = await prisma.electoralArea.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(areas);
  } catch (error) {
    console.error('Error fetching electoral areas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch electoral areas' },
      { status: 500 }
    );
  }
}

