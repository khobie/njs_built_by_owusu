'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_STATUSES,
  eaFormStatusBadgeClass,
  eaFormStatusLabel,
} from '@/lib/ea-portal-form-constants';
import { EA_PORTAL_REFRESH_EVENT, notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';
import {
  approvalLabel,
  finalEligibilityLabel,
  rowContestStatusLabel,
  type FinalEligibility,
  type NoticeOfPollPayload,
  type NoticeOfPollRow,
  type RowContestStatus,
} from '@/lib/notice-of-poll-display';

type AreaOpt = { id: string; name: string; region: string };

function contestBadgeClass(c: RowContestStatus): string {
  if (c === 'CONTESTED') return 'nop-badge nop-contested';
  if (c === 'UNOPPOSED') return 'nop-badge nop-unopposed';
  return 'nop-badge nop-muted';
}

function eligibilityBadgeClass(e: FinalEligibility): string {
  if (e === 'DISQUALIFIED') return 'nop-badge nop-rejected';
  if (e === 'ELECTED_UNOPPOSED') return 'nop-badge nop-unopposed';
  if (e === 'ON_BALLOT') return 'nop-badge nop-contested';
  if (e === 'CLEARED') return 'nop-badge nop-approved';
  return 'nop-badge nop-muted';
}

function approvalBadgeClass(status: string): string {
  if (status === 'VERIFIED') return 'nop-badge nop-approved';
  if (status === 'REJECTED') return 'nop-badge nop-rejected';
  return 'nop-badge nop-muted';
}

export default function EaPortalNoticeOfPollPage() {
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [data, setData] = useState<NoticeOfPollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const [fltAreas, setFltAreas] = useState<string[]>([]);
  const [fltPosition, setFltPosition] = useState('');
  const [fltContest, setFltContest] = useState('');
  const [fltStatus, setFltStatus] = useState('');
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [disqualifiedOnly, setDisqualifiedOnly] = useState(false);
  const [q, setQ] = useState('');

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    for (const id of fltAreas) p.append('areaId', id);
    if (fltPosition) p.set('position', fltPosition);
    if (fltContest) p.set('contestStatus', fltContest);
    if (fltStatus) p.set('status', fltStatus);
    if (approvedOnly) p.set('approvedOnly', '1');
    if (disqualifiedOnly) p.set('disqualifiedOnly', '1');
    if (q.trim()) p.set('q', q.trim());
    return p.toString();
  }, [fltAreas, fltPosition, fltContest, fltStatus, approvedOnly, disqualifiedOnly, q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/ea-portal/notice-of-poll?${queryString}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setData(null);
        setErr((j as { error?: string }).error || 'Could not load notice of poll.');
        return;
      }
      setData(await res.json());
    } catch {
      setData(null);
      setErr('Could not load notice of poll.');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetch('/api/ea-portal/areas', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: AreaOpt[]) => setAreas(raw))
      .catch(() => setAreas([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => void load();
    window.addEventListener(EA_PORTAL_REFRESH_EVENT, fn);
    return () => window.removeEventListener(EA_PORTAL_REFRESH_EVENT, fn);
  }, [load]);

  const toggleArea = (id: string) =>
    setFltAreas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clearFilters = () => {
    setFltAreas([]);
    setFltPosition('');
    setFltContest('');
    setFltStatus('');
    setApprovedOnly(false);
    setDisqualifiedOnly(false);
    setQ('');
  };

  const disqualifyAbsent = async () => {
    const confirmed = window.confirm(
      'Disqualify ALL forms that are not Verified or Rejected?\n\n' +
        'They will be marked REJECTED with the reason "Did not appear for vetting." ' +
        'Run this only after vetting is complete.'
    );
    if (!confirmed) return;
    setBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/ea-portal/notice-of-poll/disqualify-absent', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast((j as { error?: string }).error || 'Action failed.');
        return;
      }
      setToast((j as { message?: string }).message || 'Done.');
      notifyEaPortalRefresh();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  const exportBase = `/api/ea-portal/notice-of-poll/export?${queryString}`;

  const cards = s
    ? [
        { label: 'Total applicants', value: s.totalApplicants, accent: '#3b82f6' },
        { label: 'Approved', value: s.totalApproved, accent: '#22c55e' },
        { label: 'Disqualified', value: s.totalDisqualified, accent: '#ef4444' },
        { label: 'Contested positions', value: s.contestedPositions, accent: '#ea580c' },
        { label: 'Unopposed positions', value: s.unopposedPositions, accent: '#6366f1' },
        { label: 'Did not appear', value: s.didNotAppear, accent: '#78716c' },
      ]
    : [];

  return (
    <div className="nop-page">
      <header className="nop-header">
        <div>
          <h1>Notice of Poll</h1>
          <p>
            Official EA Portal vetting outcomes, contest status, and election eligibility per
            electoral area and position. Contest status counts <strong>approved (Verified)
            applicants only</strong>.
          </p>
        </div>
        <div className="nop-header-actions no-print">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => void disqualifyAbsent()} disabled={busy}>
            {busy ? 'Working…' : 'Disqualify non-attendees'}
          </button>
        </div>
      </header>

      {toast ? (
        <p className="nop-toast no-print" onAnimationEnd={() => setToast('')}>
          {toast}
        </p>
      ) : null}

      <div className="nop-cards">
        {cards.map((c) => (
          <div key={c.label} className="nop-card" style={{ ['--nop-accent' as string]: c.accent }}>
            <span className="nop-card-label">{c.label}</span>
            <span className="nop-card-value">{c.value}</span>
          </div>
        ))}
      </div>

      <div className="nop-filters no-print">
        <div className="nop-filter-head">
          <h2>Filters</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
            Reset
          </button>
        </div>
        <div className="nop-filter-grid">
          <div className="form-group">
            <label>Position</label>
            <select className="select" value={fltPosition} onChange={(e) => setFltPosition(e.target.value)}>
              <option value="">All positions</option>
              {EA_PORTAL_FORM_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Contest status</label>
            <select className="select" value={fltContest} onChange={(e) => setFltContest(e.target.value)}>
              <option value="">All</option>
              <option value="CONTESTED">Contested</option>
              <option value="UNOPPOSED">Unopposed</option>
            </select>
          </div>
          <div className="form-group">
            <label>Applicant status</label>
            <select className="select" value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
              <option value="">All</option>
              {EA_FORM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {eaFormStatusLabel(st)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label>Search</label>
            <input
              className="input"
              placeholder="Name, form #, phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="nop-area-chips">
          {areas.map((a) => (
            <label key={a.id} className={`nop-area-chip${fltAreas.includes(a.id) ? ' active' : ''}`}>
              <input type="checkbox" checked={fltAreas.includes(a.id)} onChange={() => toggleArea(a.id)} />
              {a.name}
            </label>
          ))}
        </div>

        <div className="nop-toggles">
          <label className="ea-check-label">
            <input
              type="checkbox"
              checked={approvedOnly}
              onChange={(e) => {
                setApprovedOnly(e.target.checked);
                if (e.target.checked) setDisqualifiedOnly(false);
              }}
            />
            Approved applicants only
          </label>
          <label className="ea-check-label">
            <input
              type="checkbox"
              checked={disqualifiedOnly}
              onChange={(e) => {
                setDisqualifiedOnly(e.target.checked);
                if (e.target.checked) setApprovedOnly(false);
              }}
            />
            Disqualified applicants only
          </label>
        </div>
      </div>

      <div className="nop-export-bar no-print">
        <span>
          <strong>{data?.filteredCount ?? 0}</strong> row{data?.filteredCount === 1 ? '' : 's'} match current
          filters
        </span>
        <div className="nop-export-actions">
          <a className="btn btn-primary btn-sm" href={`${exportBase}&format=csv`}>
            CSV
          </a>
          <a className="btn btn-secondary btn-sm" href={`${exportBase}&format=xls`}>
            Excel
          </a>
          <a className="btn btn-secondary btn-sm" href={`${exportBase}&format=pdf`} target="_blank" rel="noreferrer">
            PDF
          </a>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {err ? <div className="error">{err}</div> : null}

      <div className="nop-print-title only-print">
        <h2>NOTICE OF POLL — Electoral Area Portal</h2>
        {data ? <p>Generated {new Date(data.generatedAt).toLocaleString()}</p> : null}
      </div>

      <div className="nop-table-wrap">
        <table className="nop-table">
          <thead>
            <tr>
              <th>Electoral Area</th>
              <th>Position</th>
              <th>Applicant</th>
              <th>Vetting status</th>
              <th>Approval</th>
              <th>Contest</th>
              <th>Disqualification reason</th>
              <th>Final eligibility</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={8} className="nop-empty">
                  Loading…
                </td>
              </tr>
            ) : data && data.rows.length > 0 ? (
              data.rows.map((r: NoticeOfPollRow) => (
                <tr key={r.id}>
                  <td>{r.electoralAreaName}</td>
                  <td>{r.position}</td>
                  <td>{r.applicantName}</td>
                  <td>
                    <span className={`ea-status-badge ${eaFormStatusBadgeClass(r.status)}`}>
                      {eaFormStatusLabel(r.status)}
                    </span>
                  </td>
                  <td>
                    <span className={approvalBadgeClass(r.status)}>{approvalLabel(r.status)}</span>
                  </td>
                  <td>
                    <span className={contestBadgeClass(r.contestStatus)}>
                      {rowContestStatusLabel(r.contestStatus)}
                    </span>
                  </td>
                  <td className="nop-reason">{r.disqualificationReason ?? '—'}</td>
                  <td>
                    <span className={eligibilityBadgeClass(r.finalEligibility)}>
                      {finalEligibilityLabel(r.finalEligibility)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="nop-empty">
                  No applicants match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
