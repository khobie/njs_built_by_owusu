'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/dashboard/AppShell';
import { notifyDashboardRefresh } from '@/lib/dashboard-refresh';
import { useRouter } from 'next/navigation';

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

const POSITION_OPTIONS = [
  'CHAIRMAN',
  'SECRETARY',
  'ORGANIZER',
  'WOMEN ORGANIZER',
  'YOUTH ORGANIZER',
  'COMMUNICATION OFFICER',
  'ELECTORAL AFFAIRS OFFICER',
] as const;

function makeFormNumber() {
  const stamp = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `NJS-${stamp}-${rand}`;
}

function normalizeGhanaPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('233') && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

function sanitizePhoneInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('233')) {
    return `0${digits.slice(3, 12)}`;
  }
  return digits.slice(0, 10);
}

export default function FormIssuingPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formNumber, setFormNumber] = useState(makeFormNumber());
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [position, setPosition] = useState('');
  const [delegateType, setDelegateType] = useState<'NEW' | 'OLD'>('NEW');
  const [electoralAreaId, setElectoralAreaId] = useState('');
  const [pollingStationCode, setPollingStationCode] = useState('');
  const [stationSearch, setStationSearch] = useState('');
  const [comment, setComment] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedStation = useMemo(
    () => stations.find((s) => s.code === pollingStationCode),
    [stations, pollingStationCode]
  );

  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [stations, stationSearch]);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        const role = data?.user?.role;
        if (!(role === 'ADMIN' || role === 'FORM_ISSUER')) {
          router.push('/');
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/electoral-areas');
      if (!res.ok) return;
      const data = (await res.json()) as ElectoralArea[];
      setAreas(data);
    })().catch(() => {
      setError('Failed to load electoral areas.');
    });
  }, []);

  useEffect(() => {
    if (!electoralAreaId) {
      setStations([]);
      setPollingStationCode('');
      return;
    }
    setLoadingStations(true);
    setPollingStationCode('');
    setStationSearch('');
    fetch(`/api/polling-stations?areaId=${encodeURIComponent(electoralAreaId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data: PollingStation[]) => setStations(data))
      .catch(() => setError('Failed to load polling stations for selected area.'))
      .finally(() => setLoadingStations(false));
  }, [electoralAreaId]);

  const normalizedPhone = normalizeGhanaPhone(phoneNumber);
  const effectivePosition = position;

  const resetForm = () => {
    setFormNumber(makeFormNumber());
    setSurname('');
    setFirstName('');
    setMiddleName('');
    setPhoneNumber('');
    setPosition('');
    setDelegateType('NEW');
    setElectoralAreaId('');
    setPollingStationCode('');
    setComment('');
    setError('');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!surname.trim() || !firstName.trim() || !normalizedPhone.trim()) {
      setError('Please complete all required name and phone fields.');
      return;
    }
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      setError('Phone must be a valid Ghana number (e.g. 0241234567).');
      return;
    }
    if (!effectivePosition) {
      setError('Please select the position applied for.');
      return;
    }
    if (!electoralAreaId || !pollingStationCode) {
      setError('Please select electoral area and polling station.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formNumber: formNumber.trim(),
          surname: surname.trim(),
          firstName: firstName.trim(),
          middleName: middleName.trim() || undefined,
          phoneNumber: normalizedPhone,
          electoralAreaId,
          pollingStationCode,
          position: effectivePosition,
          delegateType,
          comment: comment.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error ||
            'Unable to register delegate. Please verify entries and try again.'
        );
        return;
      }

      notifyDashboardRefresh();
      setSuccess(
        `Delegate registered successfully for ${selectedStation?.name || 'selected station'} (${pollingStationCode}).`
      );
      resetForm();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell activeHref="/form-issuing">
      <div className="app-main-inner">
        <header className="dashboard-page-header">
          <div>
            <h1>Form Issuing</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Register delegates purchasing nomination forms. Polling station is stored by code.
            </p>
          </div>
          <div className="dashboard-meta">
            <Link href="/vetting" className="btn btn-secondary btn-sm">Vetting</Link>
            <Link href="/reports" className="btn btn-secondary btn-sm">Reports</Link>
          </div>
        </header>

        <section className="section" style={{ maxWidth: '900px', margin: '0 auto' }}>
          {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
          {success && (
            <div className="badge badge-approved" style={{ display: 'inline-block', marginBottom: '1rem', padding: '0.5rem 0.75rem' }}>
              {success}
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label>Form Number *</label>
                <input className="input" value={formNumber} onChange={(e) => setFormNumber(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  className="input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(sanitizePhoneInput(e.target.value))}
                  placeholder="e.g. 0241234567"
                  required
                />
              </div>
            </div>

            <div className="grid-3">
              <div className="form-group">
                <label>Surname *</label>
                <input className="input" value={surname} onChange={(e) => setSurname(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>First Name *</label>
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Middle Name</label>
                <input className="input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Position Applied For *</label>
                <select className="select" value={position} onChange={(e) => setPosition(e.target.value)} required>
                  <option value="">Select position</option>
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Delegate Type *</label>
                <select className="select" value={delegateType} onChange={(e) => setDelegateType(e.target.value as 'NEW' | 'OLD')} required>
                  <option value="NEW">New Delegate</option>
                  <option value="OLD">Old Delegate</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Electoral Area *</label>
                <select className="select" value={electoralAreaId} onChange={(e) => setElectoralAreaId(e.target.value)} required>
                  <option value="">Select electoral area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Polling Station (Name + Code) *</label>
                <input
                  className="input"
                  value={stationSearch}
                  onChange={(e) => setStationSearch(e.target.value)}
                  placeholder="Search station by name or code..."
                  disabled={!electoralAreaId || loadingStations}
                  style={{ marginBottom: '0.5rem' }}
                />
                <select
                  className="select"
                  value={pollingStationCode}
                  onChange={(e) => setPollingStationCode(e.target.value)}
                  disabled={!electoralAreaId || loadingStations}
                  required
                >
                  <option value="">
                    {!electoralAreaId ? 'Select electoral area first' : loadingStations ? 'Loading stations...' : 'Select polling station'}
                  </option>
                  {filteredStations.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                  Stored as code: <strong>{pollingStationCode || '—'}</strong>
                  {selectedStation ? ` | Name: ${selectedStation.name}` : ''}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Comment Section</label>
              <textarea
                className="input"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional notes about the delegate registration..."
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submitting}>
                Reset
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Registering...' : 'Submit'}
              </button>
            </div>

            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/form-issuing" className="btn btn-secondary btn-sm">Add another delegate</Link>
              <Link href="/vetting" className="btn btn-secondary btn-sm">View records</Link>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
