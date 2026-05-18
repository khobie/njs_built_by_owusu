'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';

type Area = {
  id: string;
  name: string;
  constituency: string;
  district: string;
  region: string;
  delegateAreaCode: string | null;
  _count: { records: number; userLinks: number };
};

export default function EaPortalAreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [full, setFull] = useState(false);
  const [form, setForm] = useState({
    name: '',
    constituency: '',
    district: '',
    region: '',
    delegateAreaCode: '',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/ea-portal/areas', { cache: 'no-store' });
    const s = await fetch('/api/auth/session');
    if (s.ok) {
      const j = await s.json();
      const r = j?.user?.role as string;
      setFull(
        r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'EA_PORTAL_ADMIN' || r === 'EA_DATA_ENTRY'
      );
    }
    if (!res.ok) {
      setErr('Failed to load areas');
      return;
    }
    setAreas(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/ea-portal/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          constituency: form.constituency,
          district: form.district,
          region: form.region,
          delegateAreaCode: form.delegateAreaCode.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error || 'Save failed');
        return;
      }
      setModal(false);
      setForm({ name: '', constituency: '', district: '', region: '', delegateAreaCode: '' });
      await load();
      notifyEaPortalRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="ea-portal-header">
        <h1>Electoral areas</h1>
        <p>Constituency, district, and region structure for the portal module.</p>
      </header>
      {err ? <div className="error">{err}</div> : null}

      <div className="ea-portal-actions" style={{ marginBottom: '1rem' }}>
        {full && (
          <button type="button" className="btn btn-primary" onClick={() => setModal(true)}>
            New area
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>All areas</h2>
        </div>
        <div className="ea-portal-table-wrap">
          <table className="ea-portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Region</th>
                <th>District</th>
                <th>Constituency</th>
                <th>Records</th>
                <th>Delegate link</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.region}</td>
                  <td>{a.district}</td>
                  <td>{a.constituency}</td>
                  <td>{a._count.records}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                    {a.delegateAreaCode ?? '—'}
                  </td>
                  <td>
                    <Link href={`/ea-portal/areas/${a.id}`} className="btn btn-secondary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="ea-portal-modal-backdrop" role="presentation" onClick={() => setModal(false)}>
          <div className="ea-portal-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ea-portal-modal-header">
              <h3>New electoral area</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(false)}>
                Close
              </button>
            </div>
            <form className="ea-portal-modal-body" onSubmit={createArea}>
              <div className="form-group">
                <label>Name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Region</label>
                  <input
                    className="input"
                    required
                    value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>District</label>
                  <input
                    className="input"
                    required
                    value={form.district}
                    onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  />
                </div>
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
              <div className="form-group">
                <label>Delegate module area code (optional)</label>
                <input
                  className="input"
                  placeholder="Matches ElectoralArea.code in main system"
                  value={form.delegateAreaCode}
                  onChange={(e) => setForm((f) => ({ ...f, delegateAreaCode: e.target.value }))}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
