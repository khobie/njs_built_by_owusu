'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_DELEGATE_TYPES,
  EA_FORM_NUMBER_MAX_LEN,
  EA_VOTER_ID_MAX_LEN,
  eaDelegateTypeLabel,
  eaFormStatusBadgeClass,
  eaFormStatusLabel,
  normalizeEaFormPhone,
  type EaFormDelegateType,
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
  surname: string;
  firstName: string;
  middleName: string | null;
  phone: string;
  voterId: string | null;
  electoralAreaId: string;
  position: string;
  formNumber: string;
  delegateType: string;
  status: string;
  comment: string | null;
  issuedAt: string;
  electoralArea: { id: string; name: string; region: string };
};

const VET_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'EA_PORTAL_ADMIN',
  'EA_DATA_ENTRY',
  'EA_VETTING_PANEL',
  'EA_OFFICER',
]);

function parseFormNumber(raw: string) {
  return raw.replace(/[^A-Za-z0-9]/g, '').slice(0, EA_FORM_NUMBER_MAX_LEN);
}

function issuedDateValue(iso: string) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function ElectoralAreaEditPage() {
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [rows, setRows] = useState<DelegateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [fltQ, setFltQ] = useState('');
  const [fltArea, setFltArea] = useState('');
  const debouncedQ = useDebouncedValue(fltQ, 350);

  const [modal, setModal] = useState<DelegateRow | null>(null);
  const [edit, setEdit] = useState({
    surname: '',
    firstName: '',
    middleName: '',
    phone: '',
    voterId: '',
    electoralAreaId: '',
    position: '',
    formNumber: '',
    delegateType: 'NEW' as EaFormDelegateType,
    comment: '',
    dateIssued: '',
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canChangeStatus = VET_ROLES.has(role);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    void fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.user?.role ?? ''));
    void fetch('/api/ea-portal/areas', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: AreaOpt[]) => setAreas(raw));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
      if (fltArea) p.set('electoralAreaId', fltArea);
      const res = await fetch(`/api/ea-portal/forms?${p}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({
          type: 'err',
          text: (data as { error?: string }).error || 'Could not load delegates.',
        });
        setRows([]);
        return;
      }
      setRows(await res.json());
    } catch {
      setToast({ type: 'err', text: 'Could not load delegates.' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, fltArea]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (r: DelegateRow) => {
    setModal(r);
    setEdit({
      surname: r.surname,
      firstName: r.firstName,
      middleName: r.middleName ?? '',
      phone: r.phone,
      voterId: r.voterId ?? '',
      electoralAreaId: r.electoralAreaId,
      position: r.position,
      formNumber: r.formNumber,
      delegateType: r.delegateType === 'OLD' ? 'OLD' : 'NEW',
      comment: r.comment ?? '',
      dateIssued: issuedDateValue(r.issuedAt),
    });
  };

  const saveEdit = async () => {
    if (!modal) return;
    const fn = parseFormNumber(edit.formNumber);
    if (!/^[A-Za-z0-9]{1,6}$/.test(fn)) {
      setToast({ type: 'err', text: 'Form number must be 1–6 letters or digits.' });
      return;
    }
    if (!edit.surname.trim() || !edit.firstName.trim()) {
      setToast({ type: 'err', text: 'Surname and first name are required.' });
      return;
    }
    if (!edit.position) {
      setToast({ type: 'err', text: 'Position is required.' });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/ea-portal/forms/${modal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          surname: edit.surname.trim(),
          firstName: edit.firstName.trim(),
          middleName: edit.middleName.trim() || null,
          phone: normalizeEaFormPhone(edit.phone),
          voterId: edit.voterId.trim() || null,
          electoralAreaId: edit.electoralAreaId,
          position: edit.position,
          formNumber: fn,
          delegateType: edit.delegateType,
          comment: edit.comment.trim() || null,
          issuedAt: edit.dateIssued ? `${edit.dateIssued}T12:00:00.000Z` : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ type: 'err', text: (data as { error?: string }).error || 'Save failed.' });
        return;
      }
      setToast({ type: 'ok', text: `Updated form ${fn} successfully.` });
      setModal(null);
      void load();
      notifyEaPortalRefresh();
    } finally {
      setBusy(false);
    }
  };

  const filteredCount = useMemo(() => rows.length, [rows]);

  return (
    <>
      {toast ? (
        <div className="ea-portal-toast-wrap" aria-live="polite">
          <div className={`ea-portal-toast ${toast.type}`}>{toast.text}</div>
        </div>
      ) : null}

      <header className="ea-portal-header">
        <h1>Edit delegates</h1>
        <p>
          Search issued Electoral Area forms and correct applicant details. Changes are saved to the
          existing record — use Vetting for verify / reject actions.
        </p>
        <div className="ea-form-issue-header-actions">
          <Link href="/electoral-area/forms" className="btn btn-secondary btn-sm">
            Issue new form
          </Link>
          <Link href="/ea-portal/vetting" className="btn btn-secondary btn-sm">
            Vetting panel
          </Link>
        </div>
      </header>

      <div className="ea-portal-filters">
        <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Search</label>
          <input
            className="input"
            placeholder="Name, phone, form #, voter ID…"
            value={fltQ}
            onChange={(e) => setFltQ(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ minWidth: 160 }}>
          <label>Electoral area</label>
          <select className="select" value={fltArea} onChange={(e) => setFltArea(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>Issued forms</h2>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {loading ? 'Loading…' : `${filteredCount} record${filteredCount === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="ea-portal-table-wrap" style={{ maxHeight: '28rem' }}>
          {loading ? (
            <p style={{ padding: '1rem' }}>Loading delegates…</p>
          ) : rows.length === 0 ? (
            <p style={{ padding: '1rem', color: '#64748b' }}>No delegates match your search.</p>
          ) : (
            <table className="ea-portal-table">
              <thead>
                <tr>
                  <th>Form #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Area</th>
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
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{r.formNumber}</td>
                    <td>{r.fullName}</td>
                    <td>{r.phone}</td>
                    <td style={{ fontSize: '0.8rem' }}>{r.electoralArea.name}</td>
                    <td style={{ fontSize: '0.72rem' }}>{r.position}</td>
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
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit(r)}>
                        Edit
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
        <div className="ea-portal-modal-backdrop" onClick={() => !busy && setModal(null)}>
          <div className="ea-portal-modal ea-portal-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="ea-portal-modal-header">
              <h3>Edit · {modal.formNumber}</h3>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setModal(null)}>
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
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: 0 }}>
                Status:{' '}
                {eaPortalVettingOutcomeLabel(modal.status) ? (
                  <span className={`ea-vetting-outcome-pill ${eaPortalVettingOutcome(modal.status)}`}>
                    {eaPortalVettingOutcome(modal.status) === 'approved' ? '✓' : '✗'}{' '}
                    {eaPortalVettingOutcomeLabel(modal.status)}
                  </span>
                ) : (
                  <span className={`ea-status-badge ${eaFormStatusBadgeClass(modal.status)}`}>
                    {eaFormStatusLabel(modal.status)}
                  </span>
                )}
                {canChangeStatus ? (
                  <span>
                    {' '}
                    — change status in{' '}
                    <Link href="/ea-portal/vetting" style={{ textDecoration: 'underline' }}>
                      Vetting panel
                    </Link>
                  </span>
                ) : null}
              </p>

              <div className="grid-3">
                <div className="form-group">
                  <label>Surname</label>
                  <input
                    className="input"
                    required
                    value={edit.surname}
                    onChange={(e) => setEdit((x) => ({ ...x, surname: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>First name</label>
                  <input
                    className="input"
                    required
                    value={edit.firstName}
                    onChange={(e) => setEdit((x) => ({ ...x, firstName: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Middle name</label>
                  <input
                    className="input"
                    value={edit.middleName}
                    onChange={(e) => setEdit((x) => ({ ...x, middleName: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid-3">
                <div className="form-group">
                  <label>Form number</label>
                  <input
                    className="input"
                    required
                    maxLength={EA_FORM_NUMBER_MAX_LEN}
                    style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}
                    value={edit.formNumber}
                    onChange={(e) => setEdit((x) => ({ ...x, formNumber: parseFormNumber(e.target.value) }))}
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    className="input"
                    required
                    inputMode="tel"
                    value={edit.phone}
                    onChange={(e) => setEdit((x) => ({ ...x, phone: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Voter ID</label>
                  <input
                    className="input"
                    maxLength={EA_VOTER_ID_MAX_LEN}
                    value={edit.voterId}
                    onChange={(e) =>
                      setEdit((x) => ({
                        ...x,
                        voterId: e.target.value.replace(/\s+/g, '').toUpperCase().slice(0, EA_VOTER_ID_MAX_LEN),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Electoral area</label>
                  <select
                    className="select"
                    required
                    value={edit.electoralAreaId}
                    onChange={(e) => setEdit((x) => ({ ...x, electoralAreaId: e.target.value }))}
                  >
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.region}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date issued</label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={edit.dateIssued}
                    onChange={(e) => setEdit((x) => ({ ...x, dateIssued: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Position</label>
                  <select
                    className="select"
                    required
                    value={edit.position}
                    onChange={(e) => setEdit((x) => ({ ...x, position: e.target.value }))}
                  >
                    <option value="">Select position</option>
                    {EA_PORTAL_FORM_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Delegate type</label>
                  <select
                    className="select"
                    value={edit.delegateType}
                    onChange={(e) =>
                      setEdit((x) => ({ ...x, delegateType: e.target.value as EaFormDelegateType }))
                    }
                  >
                    {EA_FORM_DELEGATE_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {eaDelegateTypeLabel(dt)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Comment</label>
                <textarea
                  className="input"
                  rows={3}
                  value={edit.comment}
                  onChange={(e) => setEdit((x) => ({ ...x, comment: e.target.value }))}
                />
              </div>

              <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveEdit()}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setModal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
