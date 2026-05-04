'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/dashboard/AppShell';
import { ContestDonut, DelegatesByAreaChart, VerificationDonut } from '@/components/dashboard/DashboardCharts';
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboard-refresh';
import type { DashboardAggregates } from '@/lib/dashboard-aggregates';
import { hasSystemWideAccess } from '@/lib/roles';
import { CANONICAL_POSITION_COUNT } from '@/lib/delegate-positions';

interface ElectoralArea {
  id: string;
  name: string;
  code: string;
}

interface DashboardResponse {
  updatedAt: string;
  filters: { electoralAreaId: string | null; delegateType: string | null };
  aggregates: DashboardAggregates;
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function pctShare(count: number, total: number) {
  if (total <= 0) return '0.0';
  return ((count / total) * 100).toFixed(1);
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessionRole, setSessionRole] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [filterAreaId, setFilterAreaId] = useState('');
  const [filterDelegateType, setFilterDelegateType] = useState('');
  const [appliedAreaId, setAppliedAreaId] = useState('');
  const [appliedDelegateType, setAppliedDelegateType] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fullDashboard = hasSystemWideAccess(sessionRole);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const j = await res.json();
        const r = j?.user?.role as string | undefined;
        const n = j?.user?.name as string | undefined;
        if (r) setSessionRole(r);
        if (n) setSessionName(n);
      } catch {
        router.replace('/login');
      }
    })();
  }, [router]);

  const loadDashboard = useCallback(async () => {
    if (!hasSystemWideAccess(sessionRole)) {
      setLoading(false);
      setData(null);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appliedAreaId) params.set('electoralAreaId', appliedAreaId);
      if (appliedDelegateType === 'NEW' || appliedDelegateType === 'OLD') params.set('delegateType', appliedDelegateType);
      const res = await fetch(`/api/dashboard?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load dashboard');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedAreaId, appliedDelegateType, sessionRole]);

  useEffect(() => {
    if (!sessionRole) return;
    void loadDashboard();
  }, [loadDashboard, sessionRole]);

  useEffect(() => {
    const handler = () => void loadDashboard();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, handler);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handler);
  }, [loadDashboard]);

  useEffect(() => {
    if (!fullDashboard) return;
    (async () => {
      try {
        const res = await fetch('/api/electoral-areas');
        if (res.ok) setAreas(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, [fullDashboard]);

  const agg = data?.aggregates;

  const reconcile = useMemo(() => {
    if (!agg) return null;
    const sumAreas = agg.byElectoralArea.reduce((s, r) => s + r.count, 0);
    const sumStatus = agg.byStatus.reduce((s, r) => s + r.count, 0);
    const sumDelegateType = agg.byDelegateType.reduce((s, r) => s + r.count, 0);
    const sumContestStatus = agg.byContestStatus.reduce((s, r) => s + r.count, 0);
    const verificationSum = agg.verificationVerified + agg.verificationPending + agg.verificationRejected;
    return {
      sumAreas,
      sumStatus,
      sumDelegateType,
      sumContestStatus,
      verificationSum,
      areaOk: sumAreas === agg.totalDelegates,
      statusOk: sumStatus === agg.totalDelegates,
      delegateTypeOk: sumDelegateType === agg.totalDelegates,
      contestOk: sumContestStatus === agg.totalDelegates,
      verificationOk: verificationSum === agg.totalDelegates,
    };
  }, [agg]);

  const statCards = useMemo(() => {
    if (!agg) return null;
    return [
      {
        label: 'Total delegates',
        value: agg.totalDelegates.toLocaleString(),
        hint: 'Records matching current filters',
        from: '#667eea',
        to: '#764ba2',
      },
      {
        label: 'Return rate',
        value: formatPct(agg.returnRatePct),
        hint: `${agg.returnedCount} records — statuses IMPORTED, VETTED, APPROVED, REJECTED (ISSUED counted separately)`,
        from: '#0891b2',
        to: '#0e7490',
      },
      {
        label: 'Verification rate',
        value: formatPct(agg.verificationRatePct),
        hint: `${agg.verifiedCount} verified / ${agg.totalDelegates} total`,
        from: '#10b981',
        to: '#059669',
      },
      {
        label: 'Approved delegates',
        value: agg.approvedCount.toLocaleString(),
        hint: 'Candidates approved by vetting panel',
        from: '#16a34a',
        to: '#15803d',
      },
      {
        label: 'Contested seats',
        value: agg.contestedSlots.toLocaleString(),
        hint: `${CANONICAL_POSITION_COUNT} canonical roles per station; each disputed seat counted once (${agg.delegatesExcludedFromCanonicalGrid > 0 ? `${agg.delegatesExcludedFromCanonicalGrid} delegate rows not mapped to the grid — wrong/missing station or non-canonical role` : 'every row maps to grid or anomaly count is 0'})`,
        from: '#f59e0b',
        to: '#d97706',
      },
      {
        label: 'Filled seats',
        value: agg.unopposedSlots.toLocaleString(),
        hint: `Exactly one accredited delegate occupying that seat (same ${CANONICAL_POSITION_COUNT}-role grid × ${agg.pollingStationsInScope.toLocaleString()} stations).`,
        from: '#06b6d4',
        to: '#0891b2',
      },
      {
        label: 'Vacant seats',
        value: agg.vacantSlots.toLocaleString(),
        hint: `${agg.canonicalLogicalSlots.toLocaleString()} total seats (${CANONICAL_POSITION_COUNT} roles × ${agg.pollingStationsInScope.toLocaleString()} polling stations in this view) with no delegate.`,
        from: '#cbd5e1',
        to: '#94a3b8',
      },
      {
        label: 'Old delegates',
        value: agg.oldDelegateCount.toLocaleString(),
        hint:
          agg.newDelegateCount + agg.oldDelegateCount === agg.totalDelegates
            ? 'Delegate type OLD (pairs with NEW to cover all records)'
            : `NEW+OLD (${agg.newDelegateCount + agg.oldDelegateCount}); see Delegate type breakdown for remaining labels`,
        from: '#64748b',
        to: '#475569',
      },
      {
        label: 'New delegates',
        value: agg.newDelegateCount.toLocaleString(),
        hint: 'Delegate type NEW',
        from: '#8b5cf6',
        to: '#7c3aed',
      },
      {
        label: 'Issued (outstanding)',
        value: agg.issuedOutstanding.toLocaleString(),
        hint: 'Candidates still marked ISSUED (forms not returned in workflow)',
        from: '#78716c',
        to: '#57534e',
      },
    ];
  }, [agg]);

  const updatedLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  const applyFilters = () => {
    setAppliedAreaId(filterAreaId);
    setAppliedDelegateType(filterDelegateType);
  };

  const clearFilters = () => {
    setFilterAreaId('');
    setFilterDelegateType('');
    setAppliedAreaId('');
    setAppliedDelegateType('');
  };

  if (!sessionRole) {
    return (
      <AppShell activeHref="/">
        <div className="app-main-inner">
          <div className="loading">Loading…</div>
        </div>
      </AppShell>
    );
  }

  if (!fullDashboard) {
    return (
      <AppShell activeHref="/">
        <div className="app-main-inner">
          <header className="dashboard-page-header">
            <div>
              <h1>Your portal</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
                {sessionName ? `Signed in as ${sessionName}` : 'Role-based workspace'}
              </p>
            </div>
          </header>
          <section className="section" style={{ maxWidth: '36rem' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Use the sidebar to open the tasks assigned to your role. System-wide analytics and coordination tools are limited to administrators.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {sessionRole === 'VETTING_PANEL' ? (
                <Link href="/vetting" className="btn btn-primary">
                  Open vetting
                </Link>
              ) : null}
              {sessionRole === 'FORM_ISSUER' ? (
                <>
                  <Link href="/form-issuing" className="btn btn-primary">
                    Form issuing
                  </Link>
                  <Link href="/edit-candidate" className="btn btn-secondary">
                    Edit candidate
                  </Link>
                </>
              ) : null}
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeHref="/">
      <div className="app-main-inner">
        <header className="dashboard-page-header">
          <div>
            <h1>Dashboard</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Analytical overview · Electoral Commission of Ghana (NJS)
            </p>
          </div>
          <div className="dashboard-meta">
            <span>Updated {updatedLabel}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadDashboard()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link href="/polling-stations" className="btn btn-secondary btn-sm">
              Polling stations
            </Link>
            <Link href="/edit-candidate" className="btn btn-secondary btn-sm">
              Edit candidate
            </Link>
            <Link href="/import" className="btn btn-primary btn-sm">
              Import data
            </Link>
          </div>
        </header>

        <div className="filters" style={{ marginBottom: '1.25rem' }}>
          <div className="filter-group">
            <label htmlFor="dash-area">Electoral area</label>
            <select
              id="dash-area"
              className="select"
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
            >
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="dash-delegate">Delegate type</label>
            <select
              id="dash-delegate"
              className="select"
              value={filterDelegateType}
              onChange={(e) => setFilterDelegateType(e.target.value)}
            >
              <option value="">All types</option>
              <option value="NEW">New</option>
              <option value="OLD">Old</option>
            </select>
          </div>
          <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
            <label>&nbsp;</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={applyFilters}
                disabled={loading}
              >
                Search
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearFilters}
                disabled={loading}
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {loading && !agg ? (
          <div className="loading">Loading dashboard…</div>
        ) : statCards && agg ? (
          <>
            <div className="dashboard-stat-grid">
              {statCards.map((c) => (
                <div
                  key={c.label}
                  className="dashboard-stat-card"
                  style={
                    {
                      ['--accent-from' as string]: c.from,
                      ['--accent-to' as string]: c.to,
                    } as CSSProperties
                  }
                >
                  <div className="label">{c.label}</div>
                  <div className="value">{c.value}</div>
                  {c.hint ? <div className="hint">{c.hint}</div> : null}
                </div>
              ))}
            </div>

            {/* Full breakdown reconciled to filtered total */}
            {reconcile && agg ? (
              <section className="section" style={{ marginBottom: '1.5rem' }}>
                <div className="section-header">
                  <h2 className="section-title">Record breakdown</h2>
                  <span className="badge badge-issued">{agg.totalDelegates.toLocaleString()} in this view</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.55 }}>
                  Every category below sums to your total (<strong>{agg.totalDelegates}</strong>). Use this to reconcile with CSV or vetting list counts when filters show &ldquo;all areas / all types&rdquo;.
                </p>
                {!reconcile.statusOk ||
                !reconcile.areaOk ||
                !reconcile.delegateTypeOk ||
                !reconcile.contestOk ||
                !reconcile.verificationOk ? (
                  <div className="error" style={{ marginBottom: '1rem' }}>
                    Internal tally mismatch detected — sums do not equal total delegates. Refresh or contact support.
                  </div>
                ) : null}

                <div className="table-container" style={{ marginBottom: '1.25rem' }}>
                  <table>
                    <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: '0.5rem', fontWeight: 600 }}>
                      By workflow status{' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                        Σ = {reconcile.sumStatus}
                      </span>
                    </caption>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Count</th>
                        <th style={{ textAlign: 'right', width: '6rem' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.byStatus.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td style={{ textAlign: 'right' }}>{row.count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{pctShare(row.count, agg.totalDelegates)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="table-container" style={{ marginBottom: '1.25rem' }}>
                  <table>
                    <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: '0.5rem', fontWeight: 600 }}>
                      By delegate type{' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                        Σ = {reconcile.sumDelegateType}
                      </span>
                    </caption>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Count</th>
                        <th style={{ textAlign: 'right', width: '6rem' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.byDelegateType.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td style={{ textAlign: 'right' }}>{row.count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{pctShare(row.count, agg.totalDelegates)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="table-container" style={{ marginBottom: '1.25rem' }}>
                  <table>
                    <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: '0.5rem', fontWeight: 600 }}>
                      By contest status (stored on record){' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                        Σ = {reconcile.sumContestStatus}
                      </span>
                    </caption>
                    <thead>
                      <tr>
                        <th>Contest status</th>
                        <th style={{ textAlign: 'right' }}>Count</th>
                        <th style={{ textAlign: 'right', width: '6rem' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.byContestStatus.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td style={{ textAlign: 'right' }}>{row.count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{pctShare(row.count, agg.totalDelegates)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    padding: '0.875rem 1rem',
                    background: 'var(--gray-50)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>Seven roles per polling station:</strong>{' '}
                  CHAIRMAN, SECRETARY, ORGANIZER, WOMEN ORGANIZER, YOUTH ORGANIZER, COMMUNICATION OFFICER, ELECTORAL
                  AFFAIRS OFFICER. Each contested seat counts once. Grid uses{' '}
                  {agg.canonicalLogicalSlots.toLocaleString()} seats ({CANONICAL_POSITION_COUNT} ×{' '}
                  {agg.pollingStationsInScope.toLocaleString()} stations). Delegate rows counted on-grid:{' '}
                  {agg.delegatesOnCanonicalSlotGrid.toLocaleString()}; excluded (missing code / unknown station /
                  non-canonical role): {agg.delegatesExcludedFromCanonicalGrid.toLocaleString()}.

                  <div style={{ marginTop: '0.5rem' }}>
                    Open{' '}
                    <Link href="/polling-stations" style={{ fontWeight: 600 }}>
                      Polling stations &amp; slots
                    </Link>{' '}
                    for vacancy per station.
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    Verification donut parts sum to delegates: Verified {agg.verificationVerified}, pending{' '}
                    {agg.verificationPending}, rejected status {agg.verificationRejected} (Σ {reconcile.verificationSum})
                    {reconcile.verificationOk ? ' ✓' : ' — check failed'}.
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    Electoral-area bar chart row counts sum to{' '}
                    <strong>{reconcile.sumAreas.toLocaleString()}</strong>
                    {reconcile.areaOk ? ' (matches total).' : '.'}
                  </div>
                </div>
              </section>
            ) : null}

            <div className="dashboard-charts-grid">
              <div className="dashboard-chart-card">
                <h3 className="dashboard-chart-title">Delegates by electoral area</h3>
                <DelegatesByAreaChart aggregates={agg} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="dashboard-chart-card">
                  <h3 className="dashboard-chart-title">Filled vs contested vs vacant (7-role grid)</h3>
                  <ContestDonut aggregates={agg} />
                </div>
                <div className="dashboard-chart-card">
                  <h3 className="dashboard-chart-title">Verification status</h3>
                  <VerificationDonut aggregates={agg} />
                </div>
              </div>
            </div>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Polling stations — contested seats only</h2>
                <span className="badge badge-contested">{agg.contestHighlights.length} contested slots</span>
              </div>
              {agg.contestHighlights.length === 0 ? (
                <p className="empty-state" style={{ padding: '2rem' }}>
                  No contested seats in this filtered view — no polling station has more than one delegate in the same canonical role.
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Electoral area</th>
                        <th>Polling station name</th>
                        <th>Polling station code</th>
                        <th>Position</th>
                        <th>Candidates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.contestHighlights.map((row) => (
                        <tr key={`${row.pollingStationCode}-${row.position}`}>
                          <td>{row.electoralAreaName}</td>
                          <td>{row.pollingStationName}</td>
                          <td>
                            <strong>{row.pollingStationCode}</strong>
                          </td>
                          <td>{row.position}</td>
                          <td>{row.candidateCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
