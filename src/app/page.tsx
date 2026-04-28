'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/dashboard/AppShell';
import { ContestDonut, DelegatesByAreaChart, VerificationDonut } from '@/components/dashboard/DashboardCharts';
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboard-refresh';
import type { DashboardAggregates } from '@/lib/dashboard-aggregates';

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

export default function DashboardPage() {
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [filterAreaId, setFilterAreaId] = useState('');
  const [filterDelegateType, setFilterDelegateType] = useState('');
  const [appliedAreaId, setAppliedAreaId] = useState('');
  const [appliedDelegateType, setAppliedDelegateType] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appliedAreaId) params.set('electoralAreaId', appliedAreaId);
      if (appliedDelegateType === 'NEW' || appliedDelegateType === 'OLD') params.set('delegateType', appliedDelegateType);
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load dashboard');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedAreaId, appliedDelegateType]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const handler = () => void loadDashboard();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, handler);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handler);
  }, [loadDashboard]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/electoral-areas');
        if (res.ok) setAreas(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const agg = data?.aggregates;

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
        hint: `Returned ${agg.returnedCount} / ${agg.totalDelegates} total (non‑ISSUED treated as returned)`,
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
        label: 'Contests',
        value: agg.contestedSlots.toLocaleString(),
        hint: 'Slots with >1 delegate (code + position)',
        from: '#f59e0b',
        to: '#d97706',
      },
      {
        label: 'Unopposed',
        value: agg.unopposedSlots.toLocaleString(),
        hint: 'Slots with exactly one delegate',
        from: '#06b6d4',
        to: '#0891b2',
      },
      {
        label: 'Old delegates',
        value: agg.oldDelegateCount.toLocaleString(),
        hint: 'Delegate type OLD',
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

            <div className="dashboard-charts-grid">
              <div className="dashboard-chart-card">
                <h3 className="dashboard-chart-title">Delegates by electoral area</h3>
                <DelegatesByAreaChart aggregates={agg} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="dashboard-chart-card">
                  <h3 className="dashboard-chart-title">Contest vs unopposed (by slot)</h3>
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
                <h2 className="section-title">Polling stations with contests</h2>
                <span className="badge badge-contested">{agg.contestHighlights.length} contested slots</span>
              </div>
              {agg.contestHighlights.length === 0 ? (
                <p className="empty-state" style={{ padding: '2rem' }}>
                  No contested slots in this view. Contests use polling station code + position only.
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
