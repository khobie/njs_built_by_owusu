'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_STATUSES,
  EA_FORM_DELEGATE_TYPES,
  eaDelegateTypeLabel,
  eaFormStatusBadgeClass,
  eaFormStatusLabel,
} from '@/lib/ea-portal-form-constants';
import { EA_PORTAL_REFRESH_EVENT } from '@/lib/ea-portal-refresh';

type AreaOpt = { id: string; name: string; region: string };

type ReportData = {
  meta: {
    generatedAt: string;
    totalInScope: number;
    filteredRows: number;
    uniqueSlots: number;
  };
  summary: {
    totalDelegates: number;
    returned: number;
    verified: number;
    rejected: number;
    pendingVetting: number;
    issued: number;
    contests: number;
    unopposed: number;
    contestedDelegateCount: number;
    unopposedDelegateCount: number;
    newDelegates: number;
    oldDelegates: number;
    verificationRate: number;
    returnRate: number;
    completionRate: number;
    contestSlotRate: number;
    totalSlots: number;
  };
  statusBreakdown: { status: string; label: string; count: number; pct: number }[];
  byPosition: { position: string; count: number }[];
  contestSlots: {
    areaId: string;
    areaName: string;
    region: string;
    position: string;
    applicants: number;
  }[];
  byArea: {
    areaId: string;
    areaName: string;
    region: string;
    issued: number;
    returned: number;
    verified: number;
    rejected: number;
    pending: number;
    total: number;
    contests: number;
  }[];
  rows: {
    id: string;
    formNumber: string;
    fullName: string;
    phone: string;
    voterId: string | null;
    delegateType: string;
    position: string;
    status: string;
    issuedAt: string;
    electoralAreaName: string;
    isContest: boolean;
  }[];
  filteredCount: number;
};

type ReportTab = 'overview' | 'areas' | 'contests' | 'delegates';

const STATUS_COLORS: Record<string, string> = {
  ISSUED: '#3b82f6',
  RETURNED: '#64748b',
  PENDING_VETTING: '#f59e0b',
  VERIFIED: '#22c55e',
  REJECTED: '#ef4444',
};

function BarChart({
  items,
  labelKey,
  valueKey,
  fill = 'linear-gradient(90deg, #1e40af, #3b82f6)',
}: {
  items: { [k: string]: string | number }[];
  labelKey: string;
  valueKey: string;
  fill?: string;
}) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  return (
    <div className="ea-chart-bars">
      {items.length === 0 ? (
        <p className="ea-reports-empty" style={{ padding: '1rem' }}>
          No data for current filters.
        </p>
      ) : (
        items.map((item, idx) => (
          <div key={idx} className="ea-chart-row">
            <span className="ea-chart-label" title={String(item[labelKey])}>
              {String(item[labelKey])}
            </span>
            <div className="ea-chart-track">
              <div
                className="ea-chart-fill"
                style={{
                  width: `${(Number(item[valueKey]) / max) * 100}%`,
                  background: fill,
                }}
              />
            </div>
            <span className="ea-chart-val">{item[valueKey]}</span>
          </div>
        ))
      )}
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function EaPortalReportsPage() {
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState<ReportTab>('overview');

  const [fltArea, setFltArea] = useState('');
  const [fltPosition, setFltPosition] = useState('');
  const [fltType, setFltType] = useState('');
  const [fltStatus, setFltStatus] = useState('');
  const [fltFrom, setFltFrom] = useState('');
  const [fltTo, setFltTo] = useState('');
  const [fltQ, setFltQ] = useState('');
  const [fltContest, setFltContest] = useState(false);
  const [fltUnopposed, setFltUnopposed] = useState(false);

  const debouncedQ = useDebouncedValue(fltQ, 400);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (fltArea) p.set('electoralAreaId', fltArea);
    if (fltPosition) p.set('position', fltPosition);
    if (fltType) p.set('delegateType', fltType);
    if (fltStatus) p.set('status', fltStatus);
    if (fltFrom) p.set('from', fltFrom);
    if (fltTo) p.set('to', fltTo);
    if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
    if (fltContest) p.set('contestOnly', '1');
    if (fltUnopposed) p.set('unopposedOnly', '1');
    return p.toString();
  }, [fltArea, fltPosition, fltType, fltStatus, fltFrom, fltTo, debouncedQ, fltContest, fltUnopposed]);

  const activeChips = useMemo(() => {
    const chips: string[] = [];
    if (fltArea) {
      const a = areas.find((x) => x.id === fltArea);
      chips.push(a ? `Area: ${a.name}` : 'Area filter');
    }
    if (fltPosition) chips.push(`Position: ${fltPosition}`);
    if (fltType) chips.push(eaDelegateTypeLabel(fltType));
    if (fltStatus) chips.push(eaFormStatusLabel(fltStatus));
    if (fltFrom) chips.push(`From ${fltFrom}`);
    if (fltTo) chips.push(`To ${fltTo}`);
    if (debouncedQ.trim()) chips.push(`Search: “${debouncedQ.trim()}”`);
    if (fltContest) chips.push('Contests only');
    if (fltUnopposed) chips.push('Unopposed only');
    return chips;
  }, [fltArea, fltPosition, fltType, fltStatus, fltFrom, fltTo, debouncedQ, fltContest, fltUnopposed, areas]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr('');
    try {
      const res = await fetch(`/api/ea-portal/reports/analytics?${queryString}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setData(null);
        setLoadErr((err as { error?: string }).error || 'Could not load report data.');
        return;
      }
      setData(await res.json());
    } catch {
      setData(null);
      setLoadErr('Could not load report data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetch('/api/ea-portal/areas', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: AreaOpt[]) => setAreas(raw));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => void load();
    window.addEventListener(EA_PORTAL_REFRESH_EVENT, fn);
    return () => window.removeEventListener(EA_PORTAL_REFRESH_EVENT, fn);
  }, [load]);

  const clearFilters = () => {
    setFltArea('');
    setFltPosition('');
    setFltType('');
    setFltStatus('');
    setFltFrom('');
    setFltTo('');
    setFltQ('');
    setFltContest(false);
    setFltUnopposed(false);
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const exportBase = `/api/ea-portal/forms/reports/export?view=detail&${queryString}`;
  const s = data?.summary;

  const kpis = s
    ? [
        { label: 'Total forms', value: s.totalDelegates, sub: `${data.meta.uniqueSlots} area×position slots`, accent: '#3b82f6' },
        { label: 'Verified', value: s.verified, sub: `${s.verificationRate}% of total`, accent: '#22c55e' },
        { label: 'Pending vetting', value: s.pendingVetting, sub: 'Awaiting decision', accent: '#f59e0b' },
        {
          label: 'Contested delegates',
          value: s.contestedDelegateCount,
          sub: `${s.contests} seats · ${s.contestSlotRate}% of slots`,
          accent: '#ea580c',
        },
        {
          label: 'Unopposed delegates',
          value: s.unopposedDelegateCount,
          sub:
            s.contestedDelegateCount + s.unopposedDelegateCount === s.totalDelegates
              ? 'Matches total ✓'
              : `+ contested = ${s.contestedDelegateCount + s.unopposedDelegateCount}`,
          accent: '#6366f1',
        },
        { label: 'Vetting completion', value: `${s.completionRate}%`, sub: 'Verified + rejected vs returned + pending', accent: '#0d9488' },
      ]
    : [];

  return (
    <>
      <div className="ea-reports-hero">
        <h1>Reports &amp; analytics</h1>
        <p>
          Live analytics for Electoral Area form issuing. A <strong>contest</strong> is when two or more
          delegates apply for the same electoral area and position. Filters apply instantly across all
          sections.
        </p>
        <div className="ea-reports-hero-actions">
          <Link href="/electoral-area/forms" className="btn btn-primary btn-sm">
            Issue form
          </Link>
          <Link href="/ea-portal/vetting" className="btn btn-secondary btn-sm">
            Vetting
          </Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Updating…' : 'Refresh data'}
          </button>
        </div>
      </div>

      <div className="ea-reports-filter-card">
        <div className="ea-reports-filter-head">
          <h2>Filters</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
            Reset all
          </button>
        </div>
        <div className="ea-portal-filters">
          <div className="form-group" style={{ minWidth: '150px' }}>
            <label>Electoral area</label>
            <select className="select" value={fltArea} onChange={(e) => setFltArea(e.target.value)}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '130px' }}>
            <label>Position</label>
            <select className="select" value={fltPosition} onChange={(e) => setFltPosition(e.target.value)}>
              <option value="">All</option>
              {EA_PORTAL_FORM_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '120px' }}>
            <label>Type</label>
            <select className="select" value={fltType} onChange={(e) => setFltType(e.target.value)}>
              <option value="">All</option>
              {EA_FORM_DELEGATE_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {eaDelegateTypeLabel(dt)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '130px' }}>
            <label>Status</label>
            <select className="select" value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
              <option value="">All</option>
              {EA_FORM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {eaFormStatusLabel(st)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '115px' }}>
            <label>From</label>
            <input className="input" type="date" value={fltFrom} onChange={(e) => setFltFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ minWidth: '115px' }}>
            <label>To</label>
            <input className="input" type="date" value={fltTo} onChange={(e) => setFltTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
            <label>Search</label>
            <input
              className="input"
              placeholder="Name, phone, voter ID, form #…"
              value={fltQ}
              onChange={(e) => setFltQ(e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem' }}>
          <label className="ea-check-label">
            <input
              type="checkbox"
              checked={fltContest}
              onChange={(e) => {
                setFltContest(e.target.checked);
                if (e.target.checked) setFltUnopposed(false);
              }}
            />
            Contested applicants only
          </label>
          <label className="ea-check-label">
            <input
              type="checkbox"
              checked={fltUnopposed}
              onChange={(e) => {
                setFltUnopposed(e.target.checked);
                if (e.target.checked) setFltContest(false);
              }}
            />
            Unopposed slots only
          </label>
        </div>
        {activeChips.length > 0 ? (
          <div className="ea-reports-chips">
            {activeChips.map((c) => (
              <span key={c} className="ea-reports-chip">
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {loadErr ? <div className="error" style={{ marginBottom: '1rem' }}>{loadErr}</div> : null}

      {loading && !data ? (
        <p className="ea-reports-empty">Loading analytics…</p>
      ) : null}

      {s && data ? (
        <>
          {data.meta ? (
            <p className="ea-reports-meta">
              Showing <strong>{data.filteredCount}</strong> of <strong>{data.meta.totalInScope}</strong>{' '}
              forms · {data.meta.uniqueSlots} unique slots · Updated{' '}
              {new Date(data.meta.generatedAt).toLocaleString()}
            </p>
          ) : null}

          <div className="ea-reports-kpi-grid">
            {kpis.map((k) => (
              <div key={k.label} className="ea-reports-kpi" style={{ ['--ea-kpi-accent' as string]: k.accent }}>
                <div className="ea-reports-kpi-label">{k.label}</div>
                <div className="ea-reports-kpi-value">{k.value}</div>
                <div className="ea-reports-kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="ea-reports-tabs" role="tablist">
            {(
              [
                ['overview', 'Overview'],
                ['areas', 'By area'],
                ['contests', 'Contests'],
                ['delegates', 'Delegates'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`ea-reports-tab${tab === id ? ' active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div className="ea-reports-insight-grid">
              <div className="ea-portal-panel">
                <div className="ea-portal-panel-header">
                  <h2>Status breakdown</h2>
                </div>
                <div className="ea-reports-status-stack">
                  {data.statusBreakdown.map((row) => (
                    <div key={row.status} className="ea-reports-status-row">
                      <span>{row.label}</span>
                      <div className="ea-reports-status-bar">
                        <div
                          className="ea-reports-status-fill"
                          style={{
                            width: `${row.pct}%`,
                            background: STATUS_COLORS[row.status] ?? '#94a3b8',
                          }}
                        />
                      </div>
                      <span style={{ fontWeight: 600 }}>{row.count}</span>
                      <span style={{ color: '#64748b' }}>{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ea-portal-panel">
                <div className="ea-portal-panel-header">
                  <h2>By position</h2>
                </div>
                <BarChart items={data.byPosition} labelKey="position" valueKey="count" />
              </div>
              <div className="ea-portal-panel">
                <div className="ea-portal-panel-header">
                  <h2>Delegate type</h2>
                </div>
                <BarChart
                  items={[
                    { type: 'New', count: s.newDelegates },
                    { type: 'Old', count: s.oldDelegates },
                  ]}
                  labelKey="type"
                  valueKey="count"
                  fill="linear-gradient(90deg, #059669, #34d399)"
                />
              </div>
              <div className="ea-portal-panel">
                <div className="ea-portal-panel-header">
                  <h2>Top contested slots</h2>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{s.contests} total</span>
                </div>
                <div style={{ padding: '0.65rem 1rem 1rem', maxHeight: '16rem', overflow: 'auto' }}>
                  {data.contestSlots.length === 0 ? (
                    <p className="ea-reports-empty">No contests in this filter set.</p>
                  ) : (
                    data.contestSlots.slice(0, 8).map((c) => (
                      <div key={`${c.areaId}-${c.position}`} className="ea-reports-contest-card">
                        <div>
                          <strong>
                            {c.areaName} · {c.position}
                          </strong>
                          <span>{c.region}</span>
                        </div>
                        <span className="ea-reports-contest-badge">{c.applicants} applicants</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'areas' ? (
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>Electoral area performance</h2>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Sorted by volume</span>
              </div>
              <div className="ea-portal-table-wrap ea-reports-table-compact">
                <table className="ea-portal-table">
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>Region</th>
                      <th>Forms</th>
                      <th>Issued</th>
                      <th>Returned</th>
                      <th>Verified</th>
                      <th>Rejected</th>
                      <th>Pending</th>
                      <th>Contests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byArea.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="ea-reports-empty">
                          No areas match filters.
                        </td>
                      </tr>
                    ) : (
                      data.byArea.map((a) => (
                        <tr key={a.areaId}>
                          <td style={{ fontWeight: 600 }}>{a.areaName}</td>
                          <td>{a.region}</td>
                          <td>{a.total}</td>
                          <td>{a.issued}</td>
                          <td>{a.returned}</td>
                          <td>{a.verified}</td>
                          <td>{a.rejected}</td>
                          <td>{a.pending}</td>
                          <td>{a.contests > 0 ? <span className="ea-reports-contest-badge">{a.contests}</span> : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'contests' ? (
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>All contested slots</h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 400 }}>
                  Same electoral area + position with 2+ applicants
                </p>
              </div>
              <div style={{ padding: '0.5rem 1rem 1rem', maxHeight: '28rem', overflow: 'auto' }}>
                {data.contestSlots.length === 0 ? (
                  <p className="ea-reports-empty">No contested slots for current filters.</p>
                ) : (
                  data.contestSlots.map((c) => (
                    <div key={`${c.areaId}-${c.position}`} className="ea-reports-contest-card">
                      <div>
                        <strong>
                          {c.areaName} — {c.position}
                        </strong>
                        <span>{c.region}</span>
                      </div>
                      <span className="ea-reports-contest-badge">{c.applicants} applicants</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {tab === 'delegates' ? (
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>Delegate register</h2>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {data.rows.length} row{data.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="ea-portal-table-wrap" style={{ maxHeight: '32rem' }}>
                <table className="ea-portal-table ea-reports-table-compact">
                  <thead>
                    <tr>
                      <th>Form #</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Voter ID</th>
                      <th>Area</th>
                      <th>Position</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Contest</th>
                      <th>Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="ea-reports-empty">
                          No delegates match filters.
                        </td>
                      </tr>
                    ) : (
                      data.rows.slice(0, 200).map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{r.formNumber}</td>
                          <td>{r.fullName}</td>
                          <td>{r.phone}</td>
                          <td style={{ fontSize: '0.75rem' }}>{r.voterId || '—'}</td>
                          <td>{r.electoralAreaName}</td>
                          <td style={{ fontSize: '0.72rem' }}>{r.position}</td>
                          <td style={{ fontSize: '0.75rem' }}>{eaDelegateTypeLabel(r.delegateType)}</td>
                          <td>
                            <span className={`ea-status-badge ${eaFormStatusBadgeClass(r.status)}`}>
                              {eaFormStatusLabel(r.status)}
                            </span>
                          </td>
                          <td>{r.isContest ? 'Yes' : '—'}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                            {new Date(r.issuedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {data.rows.length > 200 ? (
                <p style={{ fontSize: '0.8rem', color: '#64748b', padding: '0.75rem 1rem' }}>
                  Showing first 200 rows — export for the full list.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="ea-reports-export-bar">
            <div>
              <strong style={{ fontSize: '0.9rem' }}>Export filtered data</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                CSV, Excel, or print — uses active filters above
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <a className="btn btn-primary btn-sm" href={`${exportBase}&format=csv`} download={`ea_forms_${stamp}.csv`}>
                CSV
              </a>
              <a className="btn btn-secondary btn-sm" href={`${exportBase}&format=xls`} download={`ea_forms_${stamp}.xls`}>
                Excel
              </a>
              <a className="btn btn-secondary btn-sm" href={`${exportBase}&format=pdf`} target="_blank" rel="noreferrer">
                Print / PDF
              </a>
              <a
                className="btn btn-secondary btn-sm"
                href={`/api/ea-portal/forms/reports/export?view=summary&format=csv&${queryString}`}
                download={`ea_summary_${stamp}.csv`}
              >
                Area summary
              </a>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
