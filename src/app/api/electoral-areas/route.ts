import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function csvEscape(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const format = new URL(request.url).searchParams.get('format') ?? 'json';

    const rows = await prisma.electoralArea.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { pollingStations: true, candidates: true },
        },
      },
    });

    if (format === 'csv') {
      const header = [
        'id',
        'name',
        'code',
        'pollingStationCount',
        'candidateCount',
        'createdAt',
        'updatedAt',
      ];
      const lines = [
        header.map(csvEscape).join(','),
        ...rows.map((a) =>
          [
            a.id,
            a.name,
            a.code,
            String(a._count.pollingStations),
            String(a._count.candidates),
            a.createdAt.toISOString(),
            a.updatedAt.toISOString(),
          ]
            .map((v) => csvEscape(String(v)))
            .join(',')
        ),
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const body = `\uFEFF${lines.join('\n')}`;
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="electoral_areas_${stamp}.csv"`,
        },
      });
    }

    return NextResponse.json(
      rows.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }))
    );
  } catch (error) {
    console.error('Error fetching electoral areas:', error);
    return NextResponse.json({ error: 'Failed to fetch electoral areas' }, { status: 500 });
  }
}
