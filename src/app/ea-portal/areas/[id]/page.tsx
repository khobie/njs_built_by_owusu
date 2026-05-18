'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';

type AreaDetail = {
  id: string;
  name: string;
  constituency: string;
  district: string;
  region: string;
  delegateAreaCode: string | null;
  records: {
    id: string;
    fullName: string;
    phone: string;
    role: string;
    pollingStationCode: string | null;
    pollingStationName: string | null;
  }[];
  delegatePollingStations: { code: string; name: string }[];
};

export default function EaPortalAreaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<AreaDetail | null>(null);
  const [err, setErr] = useState('');
  const [full, setFull] = useState(false);
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    constituency: '',
    district: '',
    region: '',
    delegateAreaCode: '',
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/ea-portal/areas/${id}`, { cache: 'no-store' });
    const s = await fetch('/api/auth/session');
    if (s.ok) {
      const j = await s.json();
      const r = j?.user?.role as string;
      setFull(
        r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'EA_PORTAL_ADMIN' || r === 'EA_DATA_ENTRY'
      );
    }
    if (!res.ok) {
      setErr('Area not found');
      setData(null);
      return;
    }
    const a = (await res.json()) as AreaDetail;
    setData(a);
    setForm({
      name: a.name,
      constituency: a.constituency,
      district: a.district,
      region: a.region,
      delegateAreaCode: a.delegateAreaCode ?? '',
    });
    setErr('');
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/ea-portal/areas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          constituency: form.constituency,
          district: form.district,
          region: form.region,
          delegateAreaCode: form.delegateAreaCode.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setErr(j?.error || 'Update failed');
        return;
      }
      setEdit(false);
      await load();
      notifyEaPortalRefresh();
    } finally {
      setSaving(false);
    }
  };

  const removeArea = async () => {
    if (!window.confirm('Delete this electoral area? Records will become unassigned.')) return;
    const res = await fetch(`/api/ea-portal/areas/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setErr('Delete failed');
      return;
    }
    notifyEaPortalRefresh();
    router.push('/ea-portal/areas');
  };

  if (err && !data) return <div className="error">{err}</div>;
  if (!data) return <p>Loading…</p>;

  return (
    <>
      <header className="ea-portal-header">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/ea-portal/areas" className="btn btn-secondary btn-sm">
            ← Areas
          </Link>
          <h1 style={{ margin: 0 }}>{data.name}</h1>
        </div>
        <p>
          {data.region} · {data.district} · {data.constituency}
        </p>
      </header>
      {err ? <div className="error">{err}</div> : null}

      {full && (
        <div className="ea-portal-actions" style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setEdit((v) => !v)}>
            {edit ? 'Cancel edit' : 'Edit area'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => void removeArea()}>
            Delete area
          </button>
        </div>
      )}

      {edit && full && (
        <div className="ea-portal-panel" style={{ marginBottom: '1rem' }}>
          <div className="ea-portal-panel-header">
            <h2>Edit</h2>
          </div>
          <form className="ea-portal-modal-body" onSubmit={saveEdit}>
            <div className="form-group">
              <label>Name</label>
              <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid-3">
              <div className="form-group">
                <label>Region</label>
                <input className="input" required value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>District</label>
                <input className="input" required value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Constituency</label>
                <input
                  className="input"
                  required
                  value={form.constituency}
                  onChange={(e) => setForm((f) => ({ ...f, constituency: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Delegate area code</label>
              <input
                className="input"
                value={form.delegateAreaCode}
                onChange={(e) => setForm((f) => ({ ...f, delegateAreaCode: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              Save
            </button>
          </form>
        </div>
      )}

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>Assigned records ({data.records.length})</h2>
          <Link href={`/ea-portal/records?electoralAreaId=${id}`} className="btn btn-secondary btn-sm">
            Filter in Records
          </Link>
        </div>
        <div className="ea-portal-table-wrap">
          <table className="ea-portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Polling</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr key={r.id}>
                  <td>{r.fullName}</td>
                  <td>{r.phone}</td>
                  <td>{r.role}</td>
                  <td style={{ fontSize: '0.8rem' }}>{r.pollingStationName || r.pollingStationCode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>Polling stations (delegate module)</h2>
        </div>
        <p style={{ padding: '0 1rem 0.5rem', fontSize: '0.9rem', color: 'var(--gray-600)' }}>
          Shown when <strong>Delegate area code</strong> matches an electoral area in the main system.
        </p>
        <div className="ea-portal-table-wrap">
          <table className="ea-portal-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {data.delegatePollingStations.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ color: 'var(--gray-500)' }}>
                    No linked stations — set delegate area code on this portal area.
                  </td>
                </tr>
              ) : (
                data.delegatePollingStations.map((p) => (
                  <tr key={p.code}>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
