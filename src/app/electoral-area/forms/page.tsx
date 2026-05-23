'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_STATUSES,
  EA_FORM_DELEGATE_TYPES,
  EA_FORM_NUMBER_MAX_LEN,
  EA_VOTER_ID_MAX_LEN,
  type EaFormDelegateType,
} from '@/lib/ea-portal-form-constants';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';

type AreaOpt = {
  id: string;
  name: string;
  region: string;
  district?: string;
};

type FormRow = {
  id: string;
  fullName: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  phone: string;
  voterId: string | null;
  gender: string | null;
  address: string | null;
  electoralAreaId: string;
  pollingStationCode: string | null;
  pollingStationName: string | null;
  position: string;
  formNumber: string;
  delegateType: string;
  comment: string | null;
  status: string;
  issuedAt: string;
  electoralArea: { id: string; name: string; region: string };
  issuedBy: { id: string; name: string; email: string };
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ElectoralAreaFormsPage() {
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasLoadErr, setAreasLoadErr] = useState('');
  const [rows, setRows] = useState<FormRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyIssue, setBusyIssue] = useState(false);
  const [modal, setModal] = useState<FormRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [fltArea, setFltArea] = useState('');
  const [fltPosition, setFltPosition] = useState('');
  const [fltStatus, setFltStatus] = useState('');
  const [fltType, setFltType] = useState('');
  const [fltFrom, setFltFrom] = useState('');
  const [fltTo, setFltTo] = useState('');
  const [fltQ, setFltQ] = useState('');

  const [issue, setIssue] = useState({
    electoralAreaId: '',
    formNumber: '',
    phone: '',
    voterId: '',
    surname: '',
    firstName: '',
    middleName: '',
    position: '',
    delegateType: 'NEW' as EaFormDelegateType,
    comment: '',
    dateIssued: todayDate(),
    sourceCandidateId: '' as string,
  });

  const [autoFormNumber, setAutoFormNumber] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importQ, setImportQ] = useState('');
  const [importHits, setImportHits] = useState<
    {
      id: string;
      surname: string;
      firstName: string;
      middleName: string | null;
      phone: string;
      delegateType: string;
      position: string;
      pollingStationCode: string | null;
      pollingStationName: string | null;
      electoralAreaName: string;
    }[]
  >([]);

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
    status: 'PENDING' as (typeof EA_FORM_STATUSES)[number],
    dateIssued: todayDate(),
  });

  const loadAreas = useCallback(async () => {
    setAreasLoading(true);
    setAreasLoadErr('');
    try {
      const res = await fetch('/api/ea-portal/areas', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAreas([]);
        setAreasLoadErr(
          (data as { error?: string }).error ||
            (res.status === 401 || res.status === 403
              ? 'You do not have access to load electoral areas. Sign in with an EA portal account.'
              : 'Could not load electoral areas.')
        );
        return;
      }
      const raw: unknown[] = await res.json();
      const list = raw.map((x) => {
        const a = x as AreaOpt;
        return { id: a.id, name: a.name, region: a.region, district: a.district };
      });
      setAreas(list);
      if (list.length === 0) {
        setAreasLoadErr(
          'No electoral areas are set up yet. An admin can load them from the delegate database under EA Portal → Areas, or run database seed.'
        );
      }
    } catch {
      setAreas([]);
      setAreasLoadErr('Could not load electoral areas. Check your connection and try again.');
    } finally {
      setAreasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!importOpen || importQ.trim().length < 2) {
      setImportHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const p = new URLSearchParams({ q: importQ.trim() });
        if (issue.electoralAreaId) p.set('electoralAreaId', issue.electoralAreaId);
        const res = await fetch(`/api/ea-portal/delegates/import-search?${p}`);
        if (res.ok) setImportHits(await res.json());
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [importOpen, importQ, issue.electoralAreaId]);

  const loadForms = useCallback(async () => {
    setLoadingList(true);
    try {
      const p = new URLSearchParams();
      if (fltArea) p.set('electoralAreaId', fltArea);
      if (fltPosition) p.set('position', fltPosition);
      if (fltStatus) p.set('status', fltStatus);
      if (fltType) p.set('delegateType', fltType);
      if (fltFrom) p.set('from', fltFrom);
      if (fltTo) p.set('to', fltTo);
      if (fltQ.trim()) p.set('q', fltQ.trim());
      const res = await fetch(`/api/ea-portal/forms?${p}`, { cache: 'no-store' });
      if (res.ok) setRows(await res.json());
    } finally {
      setLoadingList(false);
    }
  }, [fltArea, fltPosition, fltStatus, fltType, fltFrom, fltTo, fltQ]);

  useEffect(() => {
    void loadAreas();
  }, [loadAreas]);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const onIssueAreaChange = (areaId: string) => {
    setIssue((s) => ({ ...s, electoralAreaId: areaId }));
  };

  const applyImport = (hit: (typeof importHits)[0]) => {
    setIssue((s) => ({
      ...s,
      surname: hit.surname,
      firstName: hit.firstName,
      middleName: hit.middleName ?? '',
      phone: hit.phone,
      delegateType: hit.delegateType === 'OLD' ? 'OLD' : 'NEW',
      position: hit.position || s.position,
      sourceCandidateId: hit.id,
    }));
    setImportOpen(false);
    setImportQ('');
    setImportHits([]);
  };

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.electoralAreaId) {
      setToast({ type: 'err', text: 'Select an Electoral Area (step 1).' });
      return;
    }
    if (!issue.surname.trim() || !issue.firstName.trim()) {
      setToast({ type: 'err', text: 'Surname and first name are required.' });
      return;
    }
    if (!issue.position) {
      setToast({ type: 'err', text: 'Choose a position applied for.' });
      return;
    }
    let fn: string | undefined;
    if (!autoFormNumber) {
      const manual = issue.formNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, EA_FORM_NUMBER_MAX_LEN);
      if (!/^[A-Za-z0-9]{1,6}$/.test(manual)) {
        setToast({
          type: 'err',
          text: `Form number must be 1–${EA_FORM_NUMBER_MAX_LEN} letters or digits (e.g. 1A12E7).`,
        });
        return;
      }
      fn = manual;
    }
    setBusyIssue(true);
    try {
      const res = await fetch('/api/ea-portal/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: issue.surname.trim(),
          firstName: issue.firstName.trim(),
          middleName: issue.middleName.trim() || null,
          phone: issue.phone,
          voterId: issue.voterId.trim() || null,
          electoralAreaId: issue.electoralAreaId,
          position: issue.position,
          ...(fn ? { formNumber: fn } : {}),
          delegateType: issue.delegateType,
          comment: issue.comment.trim() || null,
          sourceCandidateId: issue.sourceCandidateId || null,
          issuedAt: issue.dateIssued ? `${issue.dateIssued}T12:00:00.000Z` : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ type: 'err', text: (data as { error?: string }).error || 'Could not issue form.' });
        return;
      }
      setToast({ type: 'ok', text: 'Form issued successfully.' });
      setIssue({
        ...issue,
        formNumber: '',
        phone: '',
        voterId: '',
        surname: '',
        firstName: '',
        middleName: '',
        comment: '',
        dateIssued: todayDate(),
      });
      void loadForms();
      notifyEaPortalRefresh();
    } finally {
      setBusyIssue(false);
    }
  };

  const openEdit = (r: FormRow) => {
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
      delegateType: (r.delegateType === 'OLD' ? 'OLD' : 'NEW') as EaFormDelegateType,
      comment: r.comment ?? '',
      status: r.status as (typeof EA_FORM_STATUSES)[number],
      dateIssued: r.issuedAt.slice(0, 10),
    });
  };

  const saveEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!modal) return;
    if (!edit.surname.trim() || !edit.firstName.trim()) {
      setToast({ type: 'err', text: 'Surname and first name are required.' });
      return;
    }
    const fn = edit.formNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, EA_FORM_NUMBER_MAX_LEN);
    if (!/^[A-Za-z0-9]{1,6}$/.test(fn)) {
      setToast({
        type: 'err',
        text: `Form number must be 1–${EA_FORM_NUMBER_MAX_LEN} letters or digits (e.g. 1A12E7).`,
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/ea-portal/forms/${modal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: edit.surname.trim(),
          firstName: edit.firstName.trim(),
          middleName: edit.middleName.trim() || null,
          phone: edit.phone,
          voterId: edit.voterId.trim() || null,
          electoralAreaId: edit.electoralAreaId,
          position: edit.position,
          formNumber: fn,
          delegateType: edit.delegateType,
          comment: edit.comment.trim() || null,
          status: edit.status,
          issuedAt: edit.dateIssued ? `${edit.dateIssued}T12:00:00.000Z` : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ type: 'err', text: (data as { error?: string }).error || 'Update failed.' });
        return;
      }
      setToast({ type: 'ok', text: 'Form updated.' });
      setModal(null);
      void loadForms();
      notifyEaPortalRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast ? (
        <div className="ea-portal-toast-wrap" aria-live="polite">
          <div className={`ea-portal-toast ${toast.type}`}>{toast.text}</div>
        </div>
      ) : null}

      <header className="ea-portal-header">
        <h1>Electoral Area form issuing</h1>
        <p>
          Issue and register Electoral Area delegates — separate from the polling-station nomination system.
          Duplicates blocked by electoral area + position + phone.
        </p>
      </header>

      <div className="ea-portal-panel ea-form-steps">
        <div className="ea-portal-panel-header">
          <h2>Issue a form</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
            + Import existing delegate
          </button>
        </div>
        <form className="ea-portal-modal-body" onSubmit={submitIssue}>
          <div>
            <div className="ea-form-step-label">Step 1 · Electoral Area</div>
            <div className="form-group">
              <label>Electoral Area</label>
              <select
                className="select"
                required
                disabled={areasLoading || areas.length === 0}
                value={issue.electoralAreaId}
                onChange={(e) => onIssueAreaChange(e.target.value)}
              >
                <option value="">
                  {areasLoading ? 'Loading electoral areas…' : 'Select electoral area'}
                </option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.region}
                  </option>
                ))}
              </select>
              {areasLoadErr ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--danger, #b91c1c)', margin: '0.5rem 0 0' }}>
                  {areasLoadErr}{' '}
                  <Link href="/ea-portal/areas" style={{ textDecoration: 'underline' }}>
                    Manage areas
                  </Link>
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 2 · Form number, phone &amp; voter ID</div>
            <div className="grid-3">
              <div className="form-group">
                <label>Form number</label>
                <label className="ea-check-label" style={{ paddingTop: 0, marginBottom: '0.35rem' }}>
                  <input
                    type="checkbox"
                    checked={autoFormNumber}
                    onChange={(e) => setAutoFormNumber(e.target.checked)}
                  />
                  Auto-generate
                </label>
                <input
                  className="input"
                  required={!autoFormNumber}
                  disabled={autoFormNumber}
                  maxLength={EA_FORM_NUMBER_MAX_LEN}
                  autoComplete="off"
                  placeholder={autoFormNumber ? 'Generated on save' : 'e.g. 1A12E7'}
                  value={issue.formNumber}
                  onChange={(e) =>
                    setIssue((x) => ({
                      ...x,
                      formNumber: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, EA_FORM_NUMBER_MAX_LEN),
                    }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  className="input"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 0241234567"
                  value={issue.phone}
                  onChange={(e) => setIssue((x) => ({ ...x, phone: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Voter ID (Voters Card)</label>
                <input
                  className="input"
                  autoComplete="off"
                  maxLength={EA_VOTER_ID_MAX_LEN}
                  placeholder="e.g. 1234567890"
                  value={issue.voterId}
                  onChange={(e) =>
                    setIssue((x) => ({
                      ...x,
                      voterId: e.target.value.replace(/\s+/g, '').toUpperCase().slice(0, EA_VOTER_ID_MAX_LEN),
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 3 · Applicant name</div>
            <div className="grid-3">
              <div className="form-group">
                <label>Surname</label>
                <input
                  className="input"
                  required
                  value={issue.surname}
                  onChange={(e) => setIssue((x) => ({ ...x, surname: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>First name</label>
                <input
                  className="input"
                  required
                  value={issue.firstName}
                  onChange={(e) => setIssue((x) => ({ ...x, firstName: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Middle name</label>
                <input
                  className="input"
                  value={issue.middleName}
                  onChange={(e) => setIssue((x) => ({ ...x, middleName: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 4 · Position &amp; delegate type</div>
            <div className="grid-2">
              <div className="form-group">
                <label>Position applied for</label>
                <select
                  className="select"
                  required
                  value={issue.position}
                  onChange={(e) => setIssue((x) => ({ ...x, position: e.target.value }))}
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
                  required
                  value={issue.delegateType}
                  onChange={(e) =>
                    setIssue((x) => ({ ...x, delegateType: e.target.value as EaFormDelegateType }))
                  }
                >
                  {EA_FORM_DELEGATE_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt === 'NEW' ? 'New delegate' : 'Old delegate'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 5 · Comment &amp; issue date</div>
            <div className="form-group">
              <label>Comment</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Optional notes"
                value={issue.comment}
                onChange={(e) => setIssue((x) => ({ ...x, comment: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Date issued</label>
              <input
                className="input"
                type="date"
                required
                value={issue.dateIssued}
                onChange={(e) => setIssue((x) => ({ ...x, dateIssued: e.target.value }))}
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', margin: 0 }}>
              Issued by: your logged-in account (recorded automatically on save).
            </p>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busyIssue}>
              {busyIssue ? 'Submitting…' : 'Submit form'}
            </button>
          </div>
        </form>
      </div>

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>Issued forms</h2>
        </div>
        <div className="ea-portal-filters">
          <div className="form-group" style={{ minWidth: '140px' }}>
            <label>Area</label>
            <select className="select" value={fltArea} onChange={(e) => setFltArea(e.target.value)}>
              <option value="">All</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '140px' }}>
            <label>Position</label>
            <select className="select" value={fltPosition} onChange={(e) => setFltPosition(e.target.value)}>
              <option value="">All</option>
              {EA_PORTAL_FORM_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '120px' }}>
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
          <div className="form-group" style={{ minWidth: '140px' }}>
            <label>Delegate type</label>
            <select className="select" value={fltType} onChange={(e) => setFltType(e.target.value)}>
              <option value="">All</option>
              <option value="NEW">New delegate</option>
              <option value="OLD">Old delegate</option>
            </select>
          </div>
          <div className="form-group" style={{ minWidth: '120px' }}>
            <label>From</label>
            <input className="input" type="date" value={fltFrom} onChange={(e) => setFltFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ minWidth: '120px' }}>
            <label>To</label>
            <input className="input" type="date" value={fltTo} onChange={(e) => setFltTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
            <label>Search</label>
            <input
              className="input"
              placeholder="Name, phone, voter ID, form #, comment"
              value={fltQ}
              onChange={(e) => setFltQ(e.target.value)}
            />
          </div>
        </div>
        <div className="ea-portal-table-wrap">
          {loadingList ? (
            <p style={{ padding: '1rem' }}>Loading…</p>
          ) : (
            <table className="ea-portal-table">
              <thead>
                <tr>
                  <th>Form #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Voter ID</th>
                  <th>Area</th>
                  <th>Position</th>
                  <th>Delegate</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.formNumber}</td>
                    <td>{r.fullName}</td>
                    <td>{r.phone}</td>
                    <td style={{ fontSize: '0.8rem' }}>{r.voterId || '—'}</td>
                    <td>{r.electoralArea.name}</td>
                    <td style={{ fontSize: '0.8rem' }}>{r.position}</td>
                    <td>{r.delegateType === 'OLD' ? 'Old delegate' : 'New delegate'}</td>
                    <td>{r.status}</td>
                    <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {new Date(r.issuedAt).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{r.issuedBy.name}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal ? (
        <div className="ea-portal-modal-backdrop" onClick={() => setModal(null)} role="presentation">
          <div className="ea-portal-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="ea-portal-modal-header">
              <h3>Edit form · {modal.formNumber}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
            <form className="ea-portal-modal-body" onSubmit={saveEdit}>
              <div className="form-group">
                <label>Electoral Area</label>
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
                <label>Position applied for</label>
                <select
                  className="select"
                  required
                  value={edit.position}
                  onChange={(e) => setEdit((x) => ({ ...x, position: e.target.value }))}
                >
                  {EA_PORTAL_FORM_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
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
                  <label>Phone</label>
                  <input
                    className="input"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="e.g. 0241234567"
                    value={edit.phone}
                    onChange={(e) => setEdit((x) => ({ ...x, phone: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Voter ID (Voters Card)</label>
                  <input
                    className="input"
                    autoComplete="off"
                    maxLength={EA_VOTER_ID_MAX_LEN}
                    placeholder="Optional"
                    value={edit.voterId}
                    onChange={(e) =>
                      setEdit((x) => ({
                        ...x,
                        voterId: e.target.value.replace(/\s+/g, '').toUpperCase().slice(0, EA_VOTER_ID_MAX_LEN),
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Delegate type</label>
                  <select
                    className="select"
                    required
                    value={edit.delegateType}
                    onChange={(e) =>
                      setEdit((x) => ({ ...x, delegateType: e.target.value as EaFormDelegateType }))
                    }
                  >
                    {EA_FORM_DELEGATE_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt === 'NEW' ? 'New delegate' : 'Old delegate'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Form number</label>
                  <input
                    className="input"
                    required
                    maxLength={EA_FORM_NUMBER_MAX_LEN}
                    autoComplete="off"
                    placeholder="e.g. 1A12E7"
                    value={edit.formNumber}
                    onChange={(e) =>
                      setEdit((x) => ({
                        ...x,
                        formNumber: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, EA_FORM_NUMBER_MAX_LEN),
                      }))
                    }
                  />
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
              <div className="form-group">
                <label>Comment</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Optional notes"
                  value={edit.comment}
                  onChange={(e) => setEdit((x) => ({ ...x, comment: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  className="select"
                  value={edit.status}
                  onChange={(e) =>
                    setEdit((x) => ({ ...x, status: e.target.value as (typeof EA_FORM_STATUSES)[number] }))
                  }
                >
                  {EA_FORM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="ea-portal-modal-backdrop" onClick={() => setImportOpen(false)}>
          <div className="ea-portal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ea-portal-modal-header">
              <h3>Import existing delegate</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImportOpen(false)}>
                Close
              </button>
            </div>
            <div className="ea-portal-modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                Search the polling-station delegate database (does not modify those records).
              </p>
              <div className="form-group">
                <label>Name or phone</label>
                <input
                  className="input"
                  value={importQ}
                  onChange={(e) => setImportQ(e.target.value)}
                  placeholder="Type at least 2 characters"
                  autoFocus
                />
              </div>
              <ul style={{ listStyle: 'none', padding: 0, maxHeight: '14rem', overflow: 'auto' }}>
                {importHits.map((h) => (
                  <li key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: 0 }}
                      onClick={() => applyImport(h)}
                    >
                      {h.surname} {h.firstName} · {h.phone}
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray-500)' }}>
                        {h.electoralAreaName}
                        {h.pollingStationName ? ` · ${h.pollingStationName}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
