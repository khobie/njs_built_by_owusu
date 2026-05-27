import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { areaFilterForScope } from '@/lib/ea-portal-access';
import {
  buildFormsReportWhere,
  parseEaReportFiltersFromSearchParams,
} from '@/lib/ea-portal-reporting';
import { requireEaPortal } from '@/lib/ea-portal-session';

function areaSummaryFromForms(
  forms: {
    electoralAreaId: string;
    electoralArea: { name: string; region: string };
  }[]
) {
  const map = new Map<string, { areaName: string; region: string; count: number }>();
  for (const f of forms) {
    const id = f.electoralAreaId;
    const existing = map.get(id);
    if (existing) existing.count++;
    else {
      map.set(id, {
        areaName: f.electoralArea.name,
        region: f.electoralArea.region,
        count: 1,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.areaName.localeCompare(b.areaName)
  );
}

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
  const filters = parseEaReportFiltersFromSearchParams(searchParams);
  const contestsOnly = filters.contestOnly === true;
  const unopposedOnly = filters.unopposedOnly === true;
  const view = (searchParams.get('view') || 'detail').toLowerCase();

  const areaWhere = areaFilterForScope(gate.scope);
  const formsWhere = buildFormsReportWhere(gate.scope, filters);

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

  const filtered =
    contestsOnly || unopposedOnly
      ? forms.filter((f) => {
          const k = `${f.electoralAreaId}\t${f.position}`;
          if (contestsOnly) return contestedKeys.has(k);
          if (unopposedOnly) return (byKey.get(k) ?? 0) === 1;
          return true;
        })
      : forms;

  const stamp = new Date().toISOString().slice(0, 10);
  const areaSummary = areaSummaryFromForms(filtered);
  const totalForms = filtered.length;

  if (view === 'summary') {
    const summaryRows = areaSummary.map(
      (a) =>
        `<tr><td>${escapeHtml(a.areaName)}</td><td>${escapeHtml(a.region)}</td><td>${a.count}</td></tr>`
    );
    const summaryTotalRow = `<tr style="font-weight:700;background:#f1f5f9"><td colspan="2">Total</td><td>${totalForms}</td></tr>`;
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
        <table border="1"><thead><tr><th>Area</th><th>Region</th><th>Forms (filtered)</th></tr></thead><tbody>${summaryRows.join('')}${summaryTotalRow}</tbody></table>
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
        <table><thead><tr><th>Area</th><th>Region</th><th>Forms (filtered)</th></tr></thead><tbody>${summaryRows.join('')}${summaryTotalRow}</tbody></table>
        <h2>Contested positions</h2>
        <table><thead><tr><th>Area</th><th>Position</th><th>Applicants</th></tr></thead><tbody>${contestRows}</tbody></table>
      </body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const lines: string[] = [];
    lines.push(['section', 'areaName', 'region', 'formCount'].map(csvEscape).join(','));
    for (const a of areaSummary) {
      lines.push(
        ['summary_area', a.areaName, a.region, String(a.count)].map((v) => csvEscape(String(v))).join(',')
      );
    }
    lines.push(
      ['summary_total', 'TOTAL', '', String(totalForms)].map((v) => csvEscape(String(v))).join(',')
    );
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
      `<tr><td>${escapeHtml(f.formNumber)}</td><td>${escapeHtml(f.fullName)}</td><td>${escapeHtml(f.phone)}</td><td>${escapeHtml(f.voterId ?? '')}</td><td>${escapeHtml(f.electoralArea.name)}</td><td>${escapeHtml(f.position)}</td><td>${escapeHtml(f.status)}</td><td>${escapeHtml(f.delegateType)}</td><td>${f.issuedAt.toISOString()}</td><td>${escapeHtml(f.issuedBy.name)}</td></tr>`
  );

  const detailTotalRow = `<tr style="font-weight:700;background:#f1f5f9"><td colspan="9">Total rows</td><td>${totalForms}</td></tr>`;

  if (format === 'xls' || format === 'excel') {
    const summaryRows = areaSummary.map(
      (a) =>
        `<tr><td>${escapeHtml(a.areaName)}</td><td>${escapeHtml(a.region)}</td><td>${a.count}</td></tr>`
    );
    const summaryTotalRow = `<tr style="font-weight:700;background:#f1f5f9"><td colspan="2">Total</td><td>${totalForms}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
      <h2>EA Form issuing — Forms per area (filtered)</h2>
      <table border="1"><thead><tr><th>Area</th><th>Region</th><th>Forms</th></tr></thead><tbody>${summaryRows.join('')}${summaryTotalRow}</tbody></table>
      <h2>Forms ${contestsOnly ? '(contests only)' : ''} — ${totalForms} total</h2>
      <table border="1"><thead><tr><th>Form #</th><th>Name</th><th>Phone</th><th>Voter ID</th><th>Area</th><th>Position</th><th>Status</th><th>Delegate</th><th>Issued</th><th>Issued by</th></tr></thead><tbody>${detailRows.join('')}${detailTotalRow}</tbody></table>
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
      <h1>EA Form issuing ${contestsOnly ? '— contests only ' : ''}— ${escapeHtml(stamp)} (${totalForms} rows)</h1>
      <table><thead><tr><th>Form #</th><th>Name</th><th>Phone</th><th>Voter ID</th><th>Area</th><th>Position</th><th>Status</th><th>Delegate</th><th>Issued</th><th>By</th></tr></thead><tbody>${detailRows.join('')}${detailTotalRow}</tbody></table>
    </body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const lines: string[] = [];
  lines.push(['areaName', 'region', 'formCount'].map(csvEscape).join(','));
  for (const a of areaSummary) {
    lines.push([a.areaName, a.region, String(a.count)].map((v) => csvEscape(String(v))).join(','));
  }
  lines.push(['TOTAL', '', String(totalForms)].map((v) => csvEscape(String(v))).join(','));
  lines.push('');
  lines.push(
    [
      'form_id',
      'formNumber',
      'surname',
      'firstName',
      'middleName',
      'fullName',
      'phone',
      'voterId',
      'delegateType',
      'comment',
      'electoralArea',
      'region',
      'position',
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
        f.surname,
        f.firstName,
        f.middleName ?? '',
        f.fullName,
        f.phone,
        f.voterId ?? '',
        f.delegateType,
        f.comment ?? '',
        f.electoralArea.name,
        f.electoralArea.region,
        f.position,
        f.status,
        f.issuedAt.toISOString(),
        f.issuedBy.name,
      ]
        .map((v) => csvEscape(String(v)))
        .join(',')
    );
  }
  lines.push(
    ['TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', String(totalForms), '']
      .map((v) => csvEscape(String(v)))
      .join(',')
  );
  const body = `\uFEFF${lines.join('\n')}`;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ea_forms_${contestsOnly ? 'contests_' : ''}${stamp}.csv"`,
    },
  });
}
