'use client';

import { useCallback, useEffect, useState } from 'react';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';

type RecordRow = { id: string; fullName: string; phone: string; role: string; electoralAreaId: string | null };
type AreaOpt = { id: string; name: string; region: string };

export default function EaPortalReassignPage() {
  const [unassigned, setUnassigned] = useState<RecordRow[]>([]);
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetAreaId, setTargetAreaId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rRes, aRes] = await Promise.all([
      fetch('/api/ea-portal/records?unassigned=1', { cache: 'no-store' }),
      fetch('/api/ea-portal/areas', { cache: 'no-store' }),
    ]);
    if (rRes.ok) setUnassigned(await rRes.json());
    if (aRes.ok) setAreas(await aRes.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (selected.size === unassigned.length) setSelected(new Set());
    else setSelected(new Set(unassigned.map((r) => r.id)));
  };

  const save = async () => {
    if (selected.size === 0) {
      setErr('Select at least one record.');
      return;
    }
    if (!targetAreaId) {
      setErr('Choose an electoral area.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/ea-portal/records/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), electoralAreaId: targetAreaId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error || 'Reassignment failed');
        return;
      }
      setSelected(new Set());
      await load();
      notifyEaPortalRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="ea-portal-header">
        <h1>Reassign records</h1>
        <p>
          Step 1: Select records · Step 2: Choose electoral area · Step 3: Save — updates existing rows only (no
          duplicates).
        </p>
      </header>
      {err ? <div className="error">{err}</div> : null}

      <div className="ea-portal-panel" style={{ marginBottom: '1rem' }}>
        <div className="ea-portal-panel-header">
          <h2>Bulk assign</h2>
        </div>
        <div className="ea-portal-modal-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: '220px' }}>
            <label>Target electoral area</label>
            <select className="select" value={targetAreaId} onChange={(e) => setTargetAreaId(e.target.value)}>
              <option value="">— Select —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.region})
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save reassignment'}
          </button>
        </div>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>Unassigned records ({unassigned.length})</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={selectAll}>
            {selected.size === unassigned.length ? 'Clear selection' : 'Select all'}
          </button>
        </div>
        <div className="ea-portal-table-wrap">
          <table className="ea-portal-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }} />
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td>{r.fullName}</td>
                  <td>{r.phone}</td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
