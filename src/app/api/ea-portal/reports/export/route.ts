import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { areaFilterForScope, recordsVisibleWhere } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';

function csvEscape(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'csv').toLowerCase();

  const areaWhere = areaFilterForScope(gate.scope);
  const recordWhere = recordsVisibleWhere(gate.scope);

  const [areas, records] = await Promise.all([
    prisma.eaPortalArea.findMany({
      where: areaWhere,
      orderBy: [{ region: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { records: true } } },
    }),
    prisma.eaPortalRecord.findMany({
      where: recordWhere,
      orderBy: { createdAt: 'desc' },
      include: { electoralArea: true },
      take: 10_000,
    }),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'xls' || format === 'excel') {
    const summaryRows = areas.map(
      (a) =>
        `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.region)}</td><td>${a._count.records}</td></tr>`
    );
    const recordRows = records.map(
      (r) =>
        `<tr><td>${escapeHtml(r.fullName)}</td><td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.role)}</td><td>${escapeHtml(r.electoralArea?.name ?? '')}</td><td>${escapeHtml(r.pollingStationCode ?? '')}</td><td>${r.createdAt.toISOString()}</td></tr>`
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
      <h2>Electoral Area Portal — Summary</h2>
      <table border="1"><thead><tr><th>Area</th><th>Region</th><th>Records</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
      <h2>Records</h2>
      <table border="1"><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Area</th><th>Polling code</th><th>Created</th></tr></thead><tbody>${recordRows.join('')}</tbody></table>
    </body></html>`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="ea_portal_report_${stamp}.xls"`,
      },
    });
  }

  if (format === 'pdf' || format === 'print') {
    const summaryRows = areas.map(
      (a) =>
        `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.region)}</td><td>${a._count.records}</td></tr>`
    );
    const recordRows = records.slice(0, 500).map(
      (r) =>
        `<tr><td>${escapeHtml(r.fullName)}</td><td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.role)}</td><td>${escapeHtml(r.electoralArea?.name ?? '')}</td></tr>`
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <title>EA Portal Report</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 1.5rem; color: #0f172a; }
        h1 { font-size: 1.25rem; }
        table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.85rem; }
        th, td { border: 1px solid #cbd5e1; padding: 0.4rem 0.5rem; text-align: left; }
        th { background: #f1f5f9; }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <button class="no-print" type="button" onclick="window.print()">Print / Save as PDF</button>
      <h1>Electoral Area Portal Report — ${escapeHtml(stamp)}</h1>
      <h2>Records per area</h2>
      <table><thead><tr><th>Area</th><th>Region</th><th>Record count</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
      <h2>Records (up to 500)</h2>
      <table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Electoral area</th></tr></thead><tbody>${recordRows.join('')}</tbody></table>
    </body></html>`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  const lines: string[] = [];
  lines.push(['section', 'name', 'region', 'district', 'constituency', 'delegateCode', 'recordCount'].map(csvEscape).join(','));
  for (const a of areas) {
    lines.push(
      [
        'area',
        a.name,
        a.region,
        a.district,
        a.constituency,
        a.delegateAreaCode ?? '',
        String(a._count.records),
      ]
        .map((v) => csvEscape(String(v)))
        .join(',')
    );
  }
  lines.push('');
  lines.push(
    [
      'record_id',
      'fullName',
      'phone',
      'role',
      'electoralAreaId',
      'electoralAreaName',
      'pollingStationCode',
      'pollingStationName',
      'notes',
      'createdAt',
    ]
      .map(csvEscape)
      .join(',')
  );
  for (const r of records) {
    lines.push(
      [
        r.id,
        r.fullName,
        r.phone,
        r.role,
        r.electoralAreaId ?? '',
        r.electoralArea?.name ?? '',
        r.pollingStationCode ?? '',
        r.pollingStationName ?? '',
        r.notes ?? '',
        r.createdAt.toISOString(),
      ]
        .map((v) => csvEscape(String(v)))
        .join(',')
    );
  }
  const body = `\uFEFF${lines.join('\n')}`;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ea_portal_export_${stamp}.csv"`,
    },
  });
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
