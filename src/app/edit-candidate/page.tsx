'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { AppShell } from '@/components/dashboard/AppShell';
import { notifyDashboardRefresh } from '@/lib/dashboard-refresh';
import { CANONICAL_DELEGATE_POSITIONS } from '@/lib/delegate-positions';
import { canIssueForms } from '@/lib/roles';

interface ElectoralArea {
  id: string;
  name: string;
  code: string;
}

interface PollingStation {
  name: string;
  code: string;
  electoralAreaId: string;
}

interface Candidate {
  id: string;
  formNumber: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  phoneNumber: string;
  electoralAreaId: string;
  pollingStationCode: string | null;
  position: string;
  electoralArea?: ElectoralArea;
  pollingStation?: PollingStation | null;
}

const saveSchema = z.object({
  surname: z.string().min(1, 'Surname is required').max(200),
  firstName: z.string().min(1, 'First name is required').max(200),
  middleName: z.string().max(200).optional(),
  position: z.string().min(1, 'Position is required').max(200),
  electoralAreaId: z.string().min(1, 'Electoral area is required'),
  pollingStationCode: z.string().min(1, 'Select a polling station (code is stored in the database)'),
});

function EditCandidateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetId = searchParams.get('id');
  const returnFromVetting = searchParams.get('from') === 'vetting';
  const returnVettingTab = searchParams.get('vettingTab') === 'search' ? 'search' : null;

  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);

  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [position, setPosition] = useState('');
  const [electoralAreaId, setElectoralAreaId] = useState('');
  const [pollingStationCode, setPollingStationCode] = useState('');

  const [clientError, setClientError] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    void fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const data = await res.json();
        if (!canIssueForms(data?.user?.role)) {
          router.replace('/');
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

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

  const loadStations = useCallback(async (areaId: string) => {
    if (!areaId) {
      setStations([]);
      return;
    }
    try {
      const res = await fetch(`/api/polling-stations?areaId=${encodeURIComponent(areaId)}`);
      if (!res.ok) throw new Error('Failed');
      setStations(await res.json());
    } catch {
      setStations([]);
    }
  }, []);

  const applyCandidateToForm = useCallback(
    (c: Candidate) => {
      setSelected(c);
      setSurname(c.surname);
      setFirstName(c.firstName);
      setMiddleName(c.middleName ?? '');
      setPosition(c.position ?? '');
      setElectoralAreaId(c.electoralAreaId);
      setPollingStationCode(c.pollingStationCode ?? '');
      void loadStations(c.electoralAreaId);
      setClientError('');
      setServerError('');
      setSaveOk(false);
    },
    [loadStations]
  );

  useEffect(() => {
    if (!presetId) return;
    (async () => {
      try {
        const res = await fetch(`/api/candidates/${presetId}`);
        if (!res.ok) return;
        const c: Candidate = await res.json();
        applyCandidateToForm(c);
      } catch {
        /* ignore */
      }
    })();
  }, [presetId, applyCandidateToForm]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: debouncedSearch });
        const res = await fetch(`/api/candidates?${params}`);
        if (!res.ok) throw new Error('Search failed');
        const data: Candidate[] = await res.json();
        if (!cancelled) setResults(data.slice(0, 50));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    void loadStations(electoralAreaId);
  }, [electoralAreaId, loadStations]);

  const stationOptions = useMemo(() => {
    const base = stations.map((s) => ({
      code: s.code,
      label: `${s.name} (${s.code})`,
    }));
    if (pollingStationCode && !stations.some((s) => s.code === pollingStationCode)) {
      return [{ code: pollingStationCode, label: `${pollingStationCode} (current code — reselect if incorrect)` }, ...base];
    }
    return base;
  }, [stations, pollingStationCode]);

  const onAreaChange = (id: string) => {
    setElectoralAreaId(id);
    setPollingStationCode('');
    setSaveOk(false);
  };

  const onSave = async () => {
    if (!selected) return;
    setClientError('');
    setServerError('');
    setSaveOk(false);

    const parsed = saveSchema.safeParse({
      surname: surname.trim(),
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      position: position.trim(),
      electoralAreaId,
      pollingStationCode,
    });
    if (!parsed.success) {
      setClientError(parsed.error.issues.map((e) => e.message).join(' '));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: parsed.data.surname,
          firstName: parsed.data.firstName,
          middleName: parsed.data.middleName ? parsed.data.middleName : null,
          position: parsed.data.position,
          electoralAreaId: parsed.data.electoralAreaId,
          pollingStationCode: parsed.data.pollingStationCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(typeof data.error === 'string' ? data.error : 'Save failed');
        return;
      }
      applyCandidateToForm(data);
      setSaveOk(true);
      notifyDashboardRefresh();
      if (returnFromVetting) {
        const path = returnVettingTab === 'search' ? '/vetting?tab=search' : '/vetting';
        router.push(path);
      }
    } catch {
      setServerError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    const confirmed = window.confirm('Delete this candidate permanently? This action cannot be undone.');
    if (!confirmed) return;

    setClientError('');
    setServerError('');
    setSaveOk(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${selected.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(typeof data?.error === 'string' ? data.error : 'Delete failed');
        return;
      }

      setSelected(null);
      setSurname('');
      setFirstName('');
      setMiddleName('');
      setPosition('');
      setElectoralAreaId('');
      setPollingStationCode('');
      setStations([]);
      setResults((prev) => prev.filter((c) => c.id !== selected.id));
      notifyDashboardRefresh();
    } catch {
      setServerError('Network error while deleting.');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <AppShell activeHref="/edit-candidate">
      <div className="app-main-inner">
        <header className="dashboard-page-header">
          <div>
            <h1>Edit candidate</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Search by name, phone, or form number. Updates persist to the database using{' '}
              <strong>polling station code</strong> (never name alone).
            </p>
          </div>
          <div className="dashboard-meta">
            <button type="button" className="btn btn-secondary btn-sm" onClick={goBack}>
              ← Back
            </button>
            <Link href="/" className="btn btn-secondary btn-sm">
              Dashboard
            </Link>
            <Link href="/vetting" className="btn btn-secondary btn-sm">
              Vetting
            </Link>
          </div>
        </header>

        <section className="section" style={{ marginBottom: '1.25rem' }}>
          <h2 className="section-title" style={{ marginBottom: '1rem' }}>
            Find candidate
          </h2>
          <div className="filter-group" style={{ maxWidth: '100%' }}>
            <label htmlFor="edit-search">Search (min. 2 characters)</label>
            <input
              id="edit-search"
              className="input"
              placeholder="Surname, first name, form number, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          {searching && <p className="loading" style={{ padding: '1rem' }}>Searching…</p>}
          {!searching && debouncedSearch.length >= 2 && results.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', marginTop: '0.75rem' }}>No matches.</p>
          )}
          {results.length > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', textAlign: 'left' }}
                  onClick={() => applyCandidateToForm(c)}
                >
                  <span>
                    <strong>
                      {c.surname}, {c.firstName}
                    </strong>{' '}
                    <span style={{ color: 'var(--text-tertiary)' }}>· {c.formNumber}</span>
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{c.phoneNumber}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Edit record</h2>
              <span className="badge badge-issued">{selected.formNumber}</span>
            </div>

            {clientError && <div className="error">{clientError}</div>}
            {serverError && <div className="error">{serverError}</div>}
            {saveOk && <div className="badge badge-approved" style={{ marginBottom: '1rem', display: 'inline-block' }}>Saved — dashboards and lists will pick up changes on refresh or navigation.</div>}

            <div className="grid-2" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label htmlFor="sn">Surname</label>
                <input id="sn" className="input" value={surname} onChange={(e) => setSurname(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="fn">First name</label>
                <input id="fn" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="mn">Middle name (optional)</label>
              <input id="mn" className="input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>

            <div className="form-group">
              <label htmlFor="pos">Position</label>
              <select
                id="pos"
                className="select"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                <option value="">Select position</option>
                {CANONICAL_DELEGATE_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ea">Electoral area</label>
              <select id="ea" className="select" value={electoralAreaId} onChange={(e) => onAreaChange(e.target.value)}>
                <option value="">Select area…</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ps">Polling station</label>
              <select
                id="ps"
                className="select"
                value={pollingStationCode}
                onChange={(e) => setPollingStationCode(e.target.value)}
                disabled={!electoralAreaId}
              >
                <option value="">{electoralAreaId ? 'Select station…' : 'Choose electoral area first'}</option>
                {stationOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                The database stores <code>polling_station_code</code> ({pollingStationCode || '—'}).
              </p>
            </div>

            <div className="form-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={goBack}>
                ← Back
              </button>
              <button type="button" className="btn btn-danger" disabled={saving} onClick={() => void onDelete()}>
                {saving ? 'Deleting…' : 'Delete candidate'}
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

export default function EditCandidatePage() {
  return (
    <Suspense
      fallback={
        <div className="loading" style={{ minHeight: '50vh' }}>
          Loading…
        </div>
      }
    >
      <EditCandidateInner />
    </Suspense>
  );
}
