'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/dashboard/AppShell';
import { CANONICAL_POSITION_COUNT, CANONICAL_DELEGATE_POSITIONS } from '@/lib/delegate-positions';
import { hasSystemWideAccess } from '@/lib/roles';

interface ElectoralArea {
  id: string;
  name: string;
  code: string;
}

interface SlotTotals {
  vacantSlots: number;
  contestedSlots: number;
  unopposedSlots: number;
  canonicalLogicalSlots: number;
  pollingStationCount: number;
}

interface StationSlotRow {
  code: string;
  name: string;
  electoralAreaName: string;
  vacantOfSeven: number;
  contestedOfSeven: number;
  filledOfSeven: number;
  slots: { position: string; occupancy: number; slotState: 'vacant' | 'filled' | 'contested' }[];
}

export default function PollingStationsPage() {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [filterAreaId, setFilterAreaId] = useState('');
  const [filterDelegateType, setFilterDelegateType] = useState('');
  const [appliedAreaId, setAppliedAreaId] = useState('');
  const [appliedDelegateType, setAppliedDelegateType] = useState('');
  const [totals, setTotals] = useState<SlotTotals | null>(null);
  const [stations, setStations] = useState<StationSlotRow[]>([]);
  const [candidateRecords, setCandidateRecords] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const data = await res.json();
        const r = data?.user?.role as string | undefined;
        if (!r || !hasSystemWideAccess(r)) {
          router.replace('/');
          return;
        }
        setRole(r);
      } catch {
        router.replace('/login');
      }
    })();
  }, [router]);

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

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appliedAreaId) params.set('electoralAreaId', appliedAreaId);
      if (appliedDelegateType === 'NEW' || appliedDelegateType === 'OLD')
        params.set('delegateType', appliedDelegateType);
      const res = await fetch(`/api/polling-station-slots?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTotals(data.totals ?? null);
      setStations(data.stations ?? []);
      setCandidateRecords(typeof data.candidateRecordsInView === 'number' ? data.candidateRecordsInView : 0);
      setExpanded(null);
    } catch {
      setTotals(null);
      setStations([]);
    } finally {
      setLoading(false);
    }
  }, [appliedAreaId, appliedDelegateType]);

  useEffect(() => {
    if (!role) return;
    void loadSlots();
  }, [loadSlots, role]);

  const badgeFor = (slotState: string) =>
    slotState === 'vacant'
      ? 'badge badge-vacant'
      : slotState === 'filled'
        ? 'badge badge-verified'
        : 'badge badge-contested';

  if (!role) {
    return (
      <AppShell activeHref="/polling-stations">
        <div className="app-main-inner loading" style={{ padding: '3rem' }}>
          Loading…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeHref="/polling-stations">
      <div className="app-main-inner">
        <header className="dashboard-page-header">
          <div>
            <h1>Polling stations &amp; vacancy</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Exactly {CANONICAL_POSITION_COUNT} delegate roles exist per polling station (
              {CANONICAL_DELEGATE_POSITIONS.join(', ')}
              ). Vacant / contested counts use that grid; each contested seat is still counted once.
            </p>
          </div>
          <div className="dashboard-meta">
            <Link href="/" className="btn btn-secondary btn-sm">
              Dashboard
            </Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadSlots()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className="filters" style={{ marginBottom: '1.25rem' }}>
          <div className="filter-group">
            <label htmlFor="ps-area">Electoral area</label>
            <select
              id="ps-area"
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
            <label htmlFor="ps-delegate">Delegate type</label>
            <select
              id="ps-delegate"
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
                onClick={() => {
                  setAppliedAreaId(filterAreaId);
                  setAppliedDelegateType(filterDelegateType);
                }}
                disabled={loading}
              >
                Search
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFilterAreaId('');
                  setFilterDelegateType('');
                  setAppliedAreaId('');
                  setAppliedDelegateType('');
                }}
                disabled={loading}
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>

        {totals ? (
          <div className="stats-row" style={{ marginBottom: '1.25rem' }}>
            <div className="stat-card total">
              <h3>Polling stations</h3>
              <div className="value">{totals.pollingStationCount.toLocaleString()}</div>
            </div>
            <div className="stat-card vacant">
              <h3>Vacant seats</h3>
              <div className="value">{totals.vacantSlots.toLocaleString()}</div>
            </div>
            <div className="stat-card approved">
              <h3>Filled seats</h3>
              <div className="value">{totals.unopposedSlots.toLocaleString()}</div>
            </div>
            <div className="stat-card contested">
              <h3>Contested seats</h3>
              <div className="value">{totals.contestedSlots.toLocaleString()}</div>
            </div>
            <div className="stat-card pending">
              <h3>Logic seats total</h3>
              <div className="value">{totals.canonicalLogicalSlots.toLocaleString()}</div>
              <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.85 }}>
                #{CANONICAL_POSITION_COUNT} × stations
              </small>
            </div>
          </div>
        ) : null}

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Candidate records counted for this view (after filters): <strong>{candidateRecords.toLocaleString()}</strong>. Each
          person should occupy one canonical role only; contested seats show where two or more records share station + role.
        </p>

        {loading ? (
          <div className="loading">Loading stations…</div>
        ) : stations.length === 0 ? (
          <div className="empty-state">No polling stations loaded for these filters.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '2rem' }} />
                  <th>Station code</th>
                  <th>Name</th>
                  <th>Electoral area</th>
                  <th style={{ textAlign: 'right' }}>Vacant / {CANONICAL_POSITION_COUNT}</th>
                  <th style={{ textAlign: 'right' }}>Filled</th>
                  <th style={{ textAlign: 'right' }}>Contested seats</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => {
                  const open = expanded === s.code;
                  return (
                    <Fragment key={s.code}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : s.code)}
                            title={open ? 'Hide positions' : 'Show all 7 positions'}
                          >
                            {open ? '−' : '+'}
                          </button>
                        </td>
                        <td>
                          <strong>{s.code}</strong>
                        </td>
                        <td>{s.name}</td>
                        <td>{s.electoralAreaName}</td>
                        <td style={{ textAlign: 'right' }}>{s.vacantOfSeven}</td>
                        <td style={{ textAlign: 'right' }}>{s.filledOfSeven}</td>
                        <td style={{ textAlign: 'right' }}>{s.contestedOfSeven}</td>
                      </tr>
                      {open ? (
                        <tr key={`${s.code}-detail`}>
                          <td colSpan={7} style={{ background: 'var(--gray-50)', padding: '0.75rem 1rem 1rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                              Vacancy by role (this station only)
                            </div>
                            <div className="table-container" style={{ margin: 0 }}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Position</th>
                                    <th style={{ textAlign: 'right', width: '8rem' }}>Delegates</th>
                                    <th style={{ width: '10rem' }}>Seat</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.slots.map((row) => (
                                    <tr key={row.position}>
                                      <td>{row.position}</td>
                                      <td style={{ textAlign: 'right' }}>{row.occupancy}</td>
                                      <td>
                                        <span className={badgeFor(row.slotState)}>
                                          {row.slotState === 'vacant'
                                            ? 'Vacant'
                                            : row.slotState === 'filled'
                                              ? 'Filled'
                                              : 'Contested'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
