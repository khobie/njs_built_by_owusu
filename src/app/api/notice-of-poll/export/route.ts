import { NextRequest, NextResponse } from 'next/server';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';
import { canVet, hasSystemWideAccess } from '@/lib/roles';
import {
  buildNoticeOfPollData,
  finalEligibilityLabel,
  parseNoticeOfPollFilters,
  rowContestStatusLabel,
  type NoticeOfPollRow,
} from '@/lib/notice-of-poll';

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

const HEADERS = [
  'Electoral Area',
  'Position',
  'Applicant Name',
  'Vetting Status',
  'Approval Status',
  'Contest Status',
  'Disqualification Reason',
  'Final Eligibility',
];

function vettingLabel(v: string) {
  return v === 'VERIFIED' ? 'Vetted' : 'Not vetted';
}

function rowValues(r: NoticeOfPollRow): string[] {
  return [
    r.electoralAreaName,
    r.positionCanonical ?? r.position,
    r.applicantName,
    vettingLabel(r.vettingStatus),
    r.approvalStatus,
    rowContestStatusLabel(r.contestStatus),
    r.disqualificationReason ?? '',
    finalEligibilityLabel(r.finalEligibility),
  ];
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canVet(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'csv').toLowerCase();
  const scope = hasSystemWideAccess(user.role) ? null : await getSessionAreaCodes(user.id);
  const data = await buildNoticeOfPollData(scope, parseNoticeOfPollFilters(searchParams));
  const stamp = new Date().toISOString().slice(0, 10);

  const s = data.summary;
  const summaryHtml = `
    <div class="summary">
      <span><strong>${s.totalApplicants}</strong> applicants</span>
      <span><strong>${s.totalApproved}</strong> approved</span>
      <span><strong>${s.totalDisqualified}</strong> disqualified</span>
      <span><strong>${s.contestedPositions}</strong> contested positions</span>
      <span><strong>${s.unopposedPositions}</strong> unopposed positions</span>
      <span><strong>${s.didNotAppear}</strong> did not appear</span>
    </div>`;

  const tableRows = data.rows
    .map(
      (r) =>
        `<tr>${rowValues(r)
          .map((v) => `<td>${escapeHtml(v)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  const headHtml = HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join('');

  if (format === 'xls' || format === 'excel') {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
      <h2>Notice of Poll — ${escapeHtml(stamp)}</h2>
      <table border="1"><thead><tr>${headHtml}</tr></thead><tbody>${tableRows}</tbody></table>
    </body></html>`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="notice_of_poll_${stamp}.xls"`,
      },
    });
  }

  if (format === 'pdf' || format === 'print') {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Notice of Poll</title>
      <style>
        body { font-family: 'Times New Roman', Georgia, serif; padding: 2rem; color: #0f172a; }
        h1 { text-align: center; font-size: 1.4rem; margin: 0; }
        .sub { text-align: center; color: #475569; margin: 0.25rem 0 1rem; font-size: 0.9rem; }
        .summary { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; justify-content: center; margin-bottom: 1rem; font-size: 0.85rem; }
        table { border-collapse: collapse; width: 100%; font-size: 0.78rem; }
        th, td { border: 1px solid #94a3b8; padding: 0.35rem 0.45rem; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; }
        @media print { .no-print { display: none; } body { padding: 0.5rem; } }
      </style></head><body>
      <button class="no-print" type="button" onclick="window.print()">Print / Save as PDF</button>
      <h1>NOTICE OF POLL</h1>
      <p class="sub">New Juaben South · Generated ${escapeHtml(stamp)}</p>
      ${summaryHtml}
      <table><thead><tr>${headHtml}</tr></thead><tbody>${tableRows}</tbody></table>
    </body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const lines: string[] = [];
  lines.push(HEADERS.map(csvEscape).join(','));
  for (const r of data.rows) {
    lines.push(rowValues(r).map((v) => csvEscape(String(v))).join(','));
  }
  const body = `\uFEFF${lines.join('\n')}`;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="notice_of_poll_${stamp}.csv"`,
    },
  });
}
