import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { areaFilterForScope, formsVisibleWhere } from '@/lib/ea-portal-access';
import { requireEaPortal } from '@/lib/ea-portal-session';

function csvEscape(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(request: NextRequest) {
  const gate = await requireEaPortal(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'csv').toLowerCase();
  const contestsOnly = searchParams.get('contestsOnly') === '1';
  const view = (searchParams.get('view') || 'detail').toLowerCase();

  const areaWhere = areaFilterForScope(gate.scope);
  const formsWhere = formsVisibleWhere(gate.scope);

  const areas = await prisma.eaPortalArea.findMany({
    where: areaWhere,
    orderBy: [{ region: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { issuedForms: true } } },
  });

  const forms = await prisma.eaPortalIssuedForm.findMany({
    where: formsWhere,
    orderBy: { issuedAt: 'desc' },
    take: 12_000,
    include: {
      electoralArea: true,
      issuedBy: { select: { name: true, email: true } },
    },
  });

  const byKey = new Map<string, number>();
  for (const f of forms) {
    const k = `${f.electoralAreaId}\t${f.position}`;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  const contestedKeys = new Set<string>();
  for (const [k, n] of Array.from(byKey.entries())) {
    if (n > 1) contestedKeys.add(k);
  }

  const filtered = contestsOnly
    ? forms.filter((f) => contestedKeys.has(`${f.electoralAreaId}\t${f.position}`))
    : forms;

  const stamp = new Date().toISOString().slice(0, 10);

  if (view === 'summary') {
    const summaryRows = areas.map(
      (a) =>
        `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.region)}</td><td>${a._count.issuedForms}</td></tr>`
    );
    const contestRows = Array.from(contestedKeys)
      .map((k) => {
        const [areaId, position] = k.split('\t');
        const area = areas.find((x) => x.id === areaId);
        const n = byKey.get(k) ?? 0;
        return `<tr><td>${escapeHtml(area?.name ?? areaId)}</td><td>${escapeHtml(position)}</td><td>${n}</td></tr>`;
      })
      .join('');

    if (format === 'xls' || format === 'excel') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
        <h2>EA Form issuing — Summary (${escapeHtml(stamp)})</h2>
        <table border="1"><thead><tr><th>Area</th><th>Region</th><th>Forms issued</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
        <h2>Contested positions (same area + position, &gt;1 applicant)</h2>
        <table border="1"><thead><tr><th>Area</th><th>Position</th><th>Applicants</th></tr></thead><tbody>${contestRows}</tbody></table>
      </body></html>`;
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="ea_forms_summary_${stamp}.xls"`,
        },
      });
    }

    if (format === 'pdf' || format === 'print') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>EA Forms Summary</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 1.5rem; color: #0f172a; }
          table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.85rem; }
          th, td { border: 1px solid #cbd5e1; padding: 0.4rem 0.5rem; text-align: left; }
          th { background: #f1f5f9; }
          @media print { .no-print { display: none; } }
        </style></head><body>
        <button class="no-print" type="button" onclick="window.print()">Print / Save as PDF</button>
        <h1>EA Form issuing — Summary — ${escapeHtml(stamp)}</h1>
        <h2>Forms per area</h2>
        <table><thead><tr><th>Area</th><th>Region</th><th>Forms</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
        <h2>Contested positions</h2>
        <table><thead><tr><th>Area</th><th>Position</th><th>Applicants</th></tr></thead><tbody>${contestRows}</tbody></table>
      </body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const lines: string[] = [];
    lines.push(['section', 'areaName', 'region', 'formCount'].map(csvEscape).join(','));
    for (const a of areas) {
      lines.push(
        ['summary_area', a.name, a.region, String(a._count.issuedForms)].map((v) => csvEscape(String(v))).join(',')
      );
    }
    lines.push('');
    lines.push(['section', 'areaName', 'position', 'applicantCount'].map(csvEscape).join(','));
    for (const k of Array.from(contestedKeys)) {
      const [areaId, position] = k.split('\t');
      const area = areas.find((x) => x.id === areaId);
      lines.push(
        ['contest', area?.name ?? areaId, position, String(byKey.get(k) ?? 0)]
          .map((v) => csvEscape(String(v)))
          .join(',')
      );
    }
    const body = `\uFEFF${lines.join('\n')}`;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ea_forms_summary_${stamp}.csv"`,
      },
    });
  }

  const detailRows = filtered.map(
    (f) =>
      `<tr><td>${escapeHtml(f.formNumber)}</td><td>${escapeHtml(f.fullName)}</td><td>${escapeHtml(f.phone)}</td><td>${escapeHtml(f.electoralArea.name)}</td><td>${escapeHtml(f.position)}</td><td>${escapeHtml(f.status)}</td><td>${escapeHtml(f.applicantType)}</td><td>${f.issuedAt.toISOString()}</td><td>${escapeHtml(f.issuedBy.name)}</td></tr>`
  );

  if (format === 'xls' || format === 'excel') {
    const summaryRows = areas.map(
      (a) =>
        `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.region)}</td><td>${a._count.issuedForms}</td></tr>`
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
      <h2>EA Form issuing — Forms per area</h2>
      <table border="1"><thead><tr><th>Area</th><th>Region</th><th>Forms</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
      <h2>Forms ${contestsOnly ? '(contests only)' : ''}</h2>
      <table border="1"><thead><tr><th>Form #</th><th>Name</th><th>Phone</th><th>Area</th><th>Position</th><th>Status</th><th>Type</th><th>Issued</th><th>Issued by</th></tr></thead><tbody>${detailRows.join('')}</tbody></table>
    </body></html>`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="ea_forms_detail_${stamp}.xls"`,
      },
    });
  }

  if (format === 'pdf' || format === 'print') {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <title>EA Forms</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 1.5rem; color: #0f172a; }
        h1 { font-size: 1.25rem; }
        table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.8rem; }
        th, td { border: 1px solid #cbd5e1; padding: 0.35rem 0.45rem; text-align: left; }
        th { background: #f1f5f9; }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <button class="no-print" type="button" onclick="window.print()">Print / Save as PDF</button>
      <h1>EA Form issuing ${contestsOnly ? '— contests only ' : ''}— ${escapeHtml(stamp)}</h1>
      <table><thead><tr><th>Form #</th><th>Name</th><th>Phone</th><th>Area</th><th>Position</th><th>Status</th><th>Type</th><th>Issued</th><th>By</th></tr></thead><tbody>${detailRows.join('')}</tbody></table>
    </body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const lines: string[] = [];
  lines.push(['areaName', 'region', 'formCount'].map(csvEscape).join(','));
  for (const a of areas) {
    lines.push([a.name, a.region, String(a._count.issuedForms)].map((v) => csvEscape(String(v))).join(','));
  }
  lines.push('');
  lines.push(
    [
      'form_id',
      'formNumber',
      'fullName',
      'phone',
      'gender',
      'address',
      'electoralArea',
      'region',
      'pollingStationCode',
      'pollingStationName',
      'position',
      'applicantType',
      'status',
      'issuedAt',
      'issuedBy',
    ]
      .map(csvEscape)
      .join(',')
  );
  for (const f of filtered) {
    lines.push(
      [
        f.id,
        f.formNumber,
        f.fullName,
        f.phone,
        f.gender ?? '',
        f.address ?? '',
        f.electoralArea.name,
        f.electoralArea.region,
        f.pollingStationCode ?? '',
        f.pollingStationName ?? '',
        f.position,
        f.applicantType,
        f.status,
        f.issuedAt.toISOString(),
        f.issuedBy.name,
      ]
        .map((v) => csvEscape(String(v)))
        .join(',')
    );
  }
  const body = `\uFEFF${lines.join('\n')}`;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ea_forms_${contestsOnly ? 'contests_' : ''}${stamp}.csv"`,
    },
  });
}
