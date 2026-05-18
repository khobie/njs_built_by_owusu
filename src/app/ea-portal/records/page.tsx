'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';

type RecordRow = {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  electoralAreaId: string | null;
  pollingStationCode: string | null;
  pollingStationName: string | null;
  notes: string | null;
  createdAt: string;
  electoralArea: { id: string; name: string; region: string } | null;
};

type AreaOpt = { id: string; name: string; region: string };

function RecordsInner() {
  const sp = useSearchParams();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState<RecordRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [station, setStation] = useState('');
  const [areaId, setAreaId] = useState(sp.get('electoralAreaId') || '');
  const [unassignedOnly, setUnassignedOnly] = useState(sp.get('unassigned') === '1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    role: '',
    electoralAreaId: '',
    pollingStationCode: '',
    pollingStationName: '',
    notes: '',
  });

  const loadAreas = useCallback(async () => {
    const res = await fetch('/api/ea-portal/areas', { cache: 'no-store' });
    if (res.ok) setAreas(await res.json());
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (unassignedOnly) params.set('unassigned', '1');
    if (areaId) params.set('electoralAreaId', areaId);
    if (role) params.set('role', role);
    if (station) params.set('pollingStation', station);
    if (q) params.set('q', q);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/ea-portal/records?${params}`, { cache: 'no-store' });
    if (!res.ok) {
      setErr('Failed to load records');
      return;
    }
    setRows(await res.json());
    setErr('');
  }, [areaId, unassignedOnly, role, station, q, from, to]);

  useEffect(() => {
    void loadAreas();
  }, [loadAreas]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setForm({
      fullName: '',
      phone: '',
      role: '',
      electoralAreaId: areaId,
      pollingStationCode: '',
      pollingStationName: '',
      notes: '',
    });
    setModal('new');
  };

  const openEdit = (r: RecordRow) => {
    setForm({
      fullName: r.fullName,
      phone: r.phone,
      role: r.role,
      electoralAreaId: r.electoralAreaId ?? '',
      pollingStationCode: r.pollingStationCode ?? '',
      pollingStationName: r.pollingStationName ?? '',
      notes: r.notes ?? '',
    });
    setModal(r);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const body = {
        fullName: form.fullName,
        phone: form.phone,
        role: form.role,
        electoralAreaId: form.electoralAreaId.trim() || null,
        pollingStationCode: form.pollingStationCode.trim() || null,
        pollingStationName: form.pollingStationName.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (modal === 'new') {
        const res = await fetch('/api/ea-portal/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json();
          setErr(j?.error || 'Create failed');
          return;
        }
      } else if (modal) {
        const res = await fetch(`/api/ea-portal/records/${modal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json();
          setErr(j?.error || 'Update failed');
          return;
        }
      }
      setModal(null);
      await load();
      notifyEaPortalRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="ea-portal-header">
        <h1>Records</h1>
        <p>Executives and members — update in place (no duplicate rows).</p>
      </header>
      {err ? <div className="error">{err}</div> : null}

      <div className="ea-portal-filters">
        <div className="form-group" style={{ minWidth: '140px' }}>
          <label>Area</label>
          <select className="select" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">All in scope</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: '120px' }}>
          <label>Role contains</label>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="form-group" style={{ minWidth: '140px' }}>
          <label>Polling station</label>
          <input className="input" value={station} onChange={(e) => setStation(e.target.value)} />
        </div>
        <div className="form-group" style={{ minWidth: '140px' }}>
          <label>Search</label>
          <input className="input" placeholder="Name, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="form-group">
          <label>From</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
          <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
          Unassigned only
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Apply
        </button>
        <button type="button" className="btn btn-secondary" onClick={openNew}>
          New record
        </button>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-table-wrap">
          <table className="ea-portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Area</th>
                <th>Polling</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.fullName}</td>
                  <td>{r.phone}</td>
                  <td>{r.role}</td>
                  <td>{r.electoralArea?.name ?? '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{r.pollingStationName || r.pollingStationCode || '—'}</td>
                  <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="ea-portal-modal-backdrop" onClick={() => setModal(null)} role="presentation">
          <div className="ea-portal-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="ea-portal-modal-header">
              <h3>{modal === 'new' ? 'New record' : 'Edit record'}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
            <form className="ea-portal-modal-body" onSubmit={save}>
              <div className="form-group">
                <label>Full name</label>
                <input className="input" required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Phone</label>
                  <input className="input" required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <input className="input" required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Electoral area</label>
                <select
                  className="select"
                  value={form.electoralAreaId}
                  onChange={(e) => setForm((f) => ({ ...f, electoralAreaId: e.target.value }))}
                >
                  <option value="">— Unassigned —</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.region})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Polling station code</label>
                  <input className="input" value={form.pollingStationCode} onChange={(e) => setForm((f) => ({ ...f, pollingStationCode: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Polling station name</label>
                  <input className="input" value={form.pollingStationName} onChange={(e) => setForm((f) => ({ ...f, pollingStationName: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              {modal !== 'new' && (
                <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  Record id: <code>{modal.id}</code> — use this id in CSV import to update existing rows.
                </p>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function EaPortalRecordsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <RecordsInner />
    </Suspense>
  );
}
