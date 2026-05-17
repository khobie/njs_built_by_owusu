'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/dashboard/AppShell';
import { hasSystemWideAccess } from '@/lib/roles';

interface ElectoralArea {
  id: string;
  name: string;
  code: string;
}

interface StationRow {
  code: string;
  name: string;
  electoralAreaId: string;
}

export default function PollingStationsDirectoryPage() {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [filterAreaId, setFilterAreaId] = useState('');
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

  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = filterAreaId ? `?areaId=${encodeURIComponent(filterAreaId)}` : '';
        const res = await fetch(`/api/polling-stations${q}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed');
        const data: StationRow[] = await res.json();
        if (!cancelled) setStations(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setStations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, filterAreaId]);

  const areaName = useMemo(() => {
    const m = new Map(areas.map((a) => [a.id, `${a.name} (${a.code})`]));
    return (id: string) => m.get(id) ?? id;
  }, [areas]);

  if (!role) {
    return (
      <AppShell activeHref="/polling-stations/stations">
        <div className="app-main-inner loading" style={{ padding: '3rem' }}>
          Loading…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeHref="/polling-stations/stations">
      <div className="app-main-inner">
        <header className="dashboard-page-header">
          <div>
            <h1>Polling stations</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Physical polling-station register by electoral area (codes used on candidate records). This is separate from the{' '}
              seven-role vacancy grid under Electoral areas.
            </p>
          </div>
          <div className="dashboard-meta">
            <Link href="/polling-stations" className="btn btn-secondary btn-sm">
              Electoral area slots
            </Link>
            <Link href="/" className="btn btn-secondary btn-sm">
              Dashboard
            </Link>
          </div>
        </header>

        <div className="filters" style={{ marginBottom: '1.25rem' }}>
          <div className="filter-group">
            <label htmlFor="ps-dir-area">Electoral area</label>
            <select
              id="ps-dir-area"
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
        </div>

        {loading ? (
          <div className="loading">Loading stations…</div>
        ) : stations.length === 0 ? (
          <p className="empty-state" style={{ padding: '2rem' }}>
            No polling stations match this filter.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Electoral area</th>
                  <th>Station name</th>
                  <th>Code</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => (
                  <tr key={s.code}>
                    <td>{areaName(s.electoralAreaId)}</td>
                    <td>{s.name}</td>
                    <td>
                      <code>{s.code}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
