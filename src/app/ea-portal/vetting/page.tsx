'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_STATUSES,
  EA_FORM_DELEGATE_TYPES,
  eaFormStatusBadgeClass,
  eaFormStatusLabel,
} from '@/lib/ea-portal-form-constants';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';
import {
  eaPortalTableRowClass,
  eaPortalVettingOutcome,
  eaPortalVettingOutcomeLabel,
} from '@/lib/vetting-display';

type AreaOpt = { id: string; name: string; region: string };
type DelegateRow = {
  id: string;
  fullName: string;
  phone: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  electoralAreaId: string;
  position: string;
  formNumber: string;
  delegateType: string;
  status: string;
  comment: string | null;
  vettingNotes: string | null;
  electoralArea: { id: string; name: string; region: string };
};

export default function EaPortalVettingPage() {
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [rows, setRows] = useState<DelegateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fltQ, setFltQ] = useState('');
  const [fltArea, setFltArea] = useState('');
  const [fltStatus, setFltStatus] = useState('');
  const [fltContest, setFltContest] = useState(false);
  const [modal, setModal] = useState<DelegateRow | null>(null);
  const [edit, setEdit] = useState<Partial<DelegateRow>>({});
  const [vetNotes, setVetNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const loadAreas = useCallback(async () => {
    const res = await fetch('/api/ea-portal/areas', { cache: 'no-store' });
    if (res.ok) {
      const raw = await res.json();
      setAreas(raw.map((a: AreaOpt) => ({ id: a.id, name: a.name, region: a.region })));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fltQ.trim()) p.set('q', fltQ.trim());
      if (fltArea) p.set('electoralAreaId', fltArea);
      if (fltStatus) p.set('status', fltStatus);
      if (fltContest) p.set('contestOnly', '1');
      const res = await fetch(`/api/ea-portal/vetting?${p}`, { cache: 'no-store' });
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [fltQ, fltArea, fltStatus, fltContest]);

  useEffect(() => {
    void loadAreas();
  }, [loadAreas]);
  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (r: DelegateRow) => {
    setModal(r);
    setEdit({
      surname: r.surname,
      firstName: r.firstName,
      middleName: r.middleName,
      phone: r.phone,
      electoralAreaId: r.electoralAreaId,
      position: r.position,
      formNumber: r.formNumber,
      delegateType: r.delegateType,
      comment: r.comment ?? '',
    });
    setVetNotes(r.vettingNotes ?? '');
  };

  const saveEdit = async () => {
    if (!modal) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ea-portal/forms/${modal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: edit.surname,
          firstName: edit.firstName,
          middleName: edit.middleName || null,
          phone: edit.phone,
          electoralAreaId: edit.electoralAreaId,
          position: edit.position,
          formNumber: edit.formNumber,
          delegateType: edit.delegateType,
          comment: edit.comment || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast((data as { error?: string }).error || 'Save failed');
        return;
      }
      setToast('Record updated.');
      setModal(null);
      void load();
      notifyEaPortalRefresh();
    } finally {
      setBusy(false);
    }
  };

  const vetAction = async (action: 'verify' | 'reject' | 'return' | 'pending') => {
    if (!modal) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ea-portal/forms/${modal.id}/vet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, vettingNotes: vetNotes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast((data as { error?: string }).error || 'Action failed');
        return;
      }
      setToast(`Marked as ${action}.`);
      setModal(null);
      void load();
      notifyEaPortalRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="ea-portal-header">
        <h1>Vetting panel</h1>
        <p>Search, edit, reassign, and verify Electoral Area delegates. Updates existing records only.</p>
      </header>

      {toast ? (
        <p className="ea-inline-ok" onAnimationEnd={() => setToast('')}>
          {toast}
        </p>
      ) : null}

      <div className="ea-portal-filters">
        <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Search</label>
          <input
            className="input"
            placeholder="Phone, name, form #, station"
            value={fltQ}
            onChange={(e) => setFltQ(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ minWidth: 140 }}>
          <label>Electoral area</label>
          <select className="select" value={fltArea} onChange={(e) => setFltArea(e.target.value)}>
            <option value="">All</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 120 }}>
          <label>Status</label>
          <select className="select" value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
            <option value="">All</option>
            {EA_FORM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <label className="ea-check-label">
          <input type="checkbox" checked={fltContest} onChange={(e) => setFltContest(e.target.checked)} />
          Contests only
        </label>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-table-wrap">
          {loading ? (
            <p style={{ padding: '1rem' }}>Loading…</p>
          ) : (
            <table className="ea-portal-table">
              <thead>
                <tr>
                  <th>Form #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Area</th>
                  <th>Type</th>
                  <th>Position</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const outcome = eaPortalVettingOutcome(r.status);
                  const outcomeLabel = eaPortalVettingOutcomeLabel(r.status);
                  return (
                  <tr key={r.id} className={eaPortalTableRowClass(r.status)}>
                    <td>{r.formNumber}</td>
                    <td>{r.fullName}</td>
                    <td>{r.phone}</td>
                    <td>{r.electoralArea.name}</td>
                    <td>{r.delegateType === 'OLD' ? 'Old' : 'New'}</td>
                    <td style={{ fontSize: '0.75rem' }}>{r.position}</td>
                    <td>
                      {outcome && outcomeLabel ? (
                        <span className={`ea-vetting-outcome-pill ${outcome}`}>
                          {outcome === 'approved' ? '✓' : '✗'} {outcomeLabel}
                        </span>
                      ) : (
                        <span className={`ea-status-badge ${eaFormStatusBadgeClass(r.status)}`}>
                          {eaFormStatusLabel(r.status)}
                        </span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                        Review
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal ? (
        <div className="ea-portal-modal-backdrop" onClick={() => setModal(null)}>
          <div className="ea-portal-modal ea-portal-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="ea-portal-modal-header">
              <h3>Vet · {modal.formNumber}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
            <div className="ea-portal-modal-body">
              {(() => {
                const outcome = eaPortalVettingOutcome(modal.status);
                const label = eaPortalVettingOutcomeLabel(modal.status);
                if (!outcome || !label) return null;
                return (
                  <div className={`vetting-decision-banner ${outcome}`} style={{ marginBottom: '1rem' }}>
                    {outcome === 'approved' ? '✓' : '✗'} {label} — vetting decision recorded
                  </div>
                );
              })()}
              <div className="grid-3">
                <div className="form-group">
                  <label>Surname</label>
                  <input className="input" value={edit.surname ?? ''} onChange={(e) => setEdit((x) => ({ ...x, surname: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>First name</label>
                  <input className="input" value={edit.firstName ?? ''} onChange={(e) => setEdit((x) => ({ ...x, firstName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Middle name</label>
                  <input className="input" value={edit.middleName ?? ''} onChange={(e) => setEdit((x) => ({ ...x, middleName: e.target.value }))} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Phone</label>
                  <input className="input" value={edit.phone ?? ''} onChange={(e) => setEdit((x) => ({ ...x, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Electoral area</label>
                  <select
                    className="select"
                    value={edit.electoralAreaId ?? ''}
                    onChange={(e) => setEdit((x) => ({ ...x, electoralAreaId: e.target.value }))}
                  >
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Position</label>
                  <select className="select" value={edit.position ?? ''} onChange={(e) => setEdit((x) => ({ ...x, position: e.target.value }))}>
                    {EA_PORTAL_FORM_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Delegate type</label>
                  <select className="select" value={edit.delegateType ?? 'NEW'} onChange={(e) => setEdit((x) => ({ ...x, delegateType: e.target.value }))}>
                    {EA_FORM_DELEGATE_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt === 'NEW' ? 'New delegate' : 'Old delegate'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Vetting notes</label>
                <textarea className="input" rows={3} value={vetNotes} onChange={(e) => setVetNotes(e.target.value)} />
              </div>
              <div className="ea-vet-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveEdit()}>
                  Save changes
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void vetAction('return')}>
                  Returned
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void vetAction('pending')}>
                  Pending vetting
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void vetAction('verify')}>
                  Verify
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void vetAction('reject')}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
