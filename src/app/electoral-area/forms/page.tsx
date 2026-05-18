'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_STATUSES,
} from '@/lib/ea-portal-form-constants';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';

type AreaOpt = {
  id: string;
  name: string;
  region: string;
  district?: string;
};

type PollingSearchHit = {
  code: string;
  name: string;
  electoralArea: { name: string; code: string };
};

type FormRow = {
  id: string;
  fullName: string;
  phone: string;
  gender: string | null;
  address: string | null;
  electoralAreaId: string;
  pollingStationCode: string | null;
  pollingStationName: string | null;
  position: string;
  formNumber: string;
  applicantType: string;
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
    pollingStationCode: '',
    pollingStationName: '',
    position: '',
    fullName: '',
    phone: '',
    gender: '',
    address: '',
    applicantType: 'NEW' as 'EXISTING' | 'NEW',
    formNumber: '',
    dateIssued: todayDate(),
  });

  const [stationQuery, setStationQuery] = useState('');
  const [stationHits, setStationHits] = useState<PollingSearchHit[]>([]);
  const [stationSearchBusy, setStationSearchBusy] = useState(false);

  const [editStationQuery, setEditStationQuery] = useState('');
  const [editStationHits, setEditStationHits] = useState<PollingSearchHit[]>([]);
  const [editStationSearchBusy, setEditStationSearchBusy] = useState(false);

  const [edit, setEdit] = useState({
    fullName: '',
    phone: '',
    gender: '',
    address: '',
    electoralAreaId: '',
    pollingStationCode: '',
    pollingStationName: '',
    position: '',
    formNumber: '',
    applicantType: 'NEW' as 'EXISTING' | 'NEW',
    status: 'PENDING' as (typeof EA_FORM_STATUSES)[number],
    dateIssued: todayDate(),
  });

  const loadAreas = useCallback(async () => {
    const res = await fetch('/api/ea-portal/areas', { cache: 'no-store' });
    if (res.ok) {
      const raw: unknown[] = await res.json();
      setAreas(
        raw.map((x) => {
          const a = x as AreaOpt;
          return { id: a.id, name: a.name, region: a.region, district: a.district };
        })
      );
    }
  }, []);

  useEffect(() => {
    if (!issue.electoralAreaId || stationQuery.trim().length < 2) {
      setStationHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setStationSearchBusy(true);
        try {
          const p = new URLSearchParams({
            q: stationQuery.trim(),
            eaPortalAreaId: issue.electoralAreaId,
          });
          const res = await fetch(`/api/ea-portal/polling-stations/search?${p}`, { cache: 'no-store' });
          if (res.ok) {
            const data = (await res.json()) as PollingSearchHit[];
            setStationHits(Array.isArray(data) ? data : []);
          } else {
            setStationHits([]);
          }
        } finally {
          setStationSearchBusy(false);
        }
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [stationQuery, issue.electoralAreaId]);

  useEffect(() => {
    if (!modal) {
      setEditStationHits([]);
      setEditStationQuery('');
      return;
    }
    if (!edit.electoralAreaId || editStationQuery.trim().length < 2) {
      setEditStationHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setEditStationSearchBusy(true);
        try {
          const p = new URLSearchParams({
            q: editStationQuery.trim(),
            eaPortalAreaId: edit.electoralAreaId,
          });
          const res = await fetch(`/api/ea-portal/polling-stations/search?${p}`, { cache: 'no-store' });
          if (res.ok) {
            const data = (await res.json()) as PollingSearchHit[];
            setEditStationHits(Array.isArray(data) ? data : []);
          } else {
            setEditStationHits([]);
          }
        } finally {
          setEditStationSearchBusy(false);
        }
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [modal, editStationQuery, edit.electoralAreaId]);

  const loadForms = useCallback(async () => {
    setLoadingList(true);
    try {
      const p = new URLSearchParams();
      if (fltArea) p.set('electoralAreaId', fltArea);
      if (fltPosition) p.set('position', fltPosition);
      if (fltStatus) p.set('status', fltStatus);
      if (fltType) p.set('applicantType', fltType);
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
    setIssue((s) => ({
      ...s,
      electoralAreaId: areaId,
      pollingStationCode: '',
      pollingStationName: '',
    }));
    setStationQuery('');
    setStationHits([]);
  };

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.electoralAreaId) {
      setToast({ type: 'err', text: 'Select an Electoral Area (step 1).' });
      return;
    }
    if (!issue.position) {
      setToast({ type: 'err', text: 'Choose a position (step 3).' });
      return;
    }
    setBusyIssue(true);
    try {
      const res = await fetch('/api/ea-portal/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: issue.fullName.trim(),
          phone: issue.phone,
          gender: issue.gender.trim() || null,
          address: issue.address.trim() || null,
          electoralAreaId: issue.electoralAreaId,
          pollingStationCode: issue.pollingStationCode.trim() || null,
          pollingStationName: issue.pollingStationName.trim() || null,
          position: issue.position,
          formNumber: issue.formNumber.trim(),
          applicantType: issue.applicantType,
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
        fullName: '',
        phone: '',
        gender: '',
        address: '',
        formNumber: '',
        pollingStationCode: '',
        pollingStationName: '',
        dateIssued: todayDate(),
      });
      setStationQuery('');
      setStationHits([]);
      void loadForms();
      notifyEaPortalRefresh();
    } finally {
      setBusyIssue(false);
    }
  };

  const openEdit = (r: FormRow) => {
    setModal(r);
    setEditStationQuery('');
    setEditStationHits([]);
    setEdit({
      fullName: r.fullName,
      phone: r.phone,
      gender: r.gender ?? '',
      address: r.address ?? '',
      electoralAreaId: r.electoralAreaId,
      pollingStationCode: r.pollingStationCode ?? '',
      pollingStationName: r.pollingStationName ?? '',
      position: r.position,
      formNumber: r.formNumber,
      applicantType: r.applicantType as 'EXISTING' | 'NEW',
      status: r.status as (typeof EA_FORM_STATUSES)[number],
      dateIssued: r.issuedAt.slice(0, 10),
    });
  };

  const saveEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!modal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ea-portal/forms/${modal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: edit.fullName.trim(),
          phone: edit.phone,
          gender: edit.gender.trim() || null,
          address: edit.address.trim() || null,
          electoralAreaId: edit.electoralAreaId,
          pollingStationCode: edit.pollingStationCode || null,
          pollingStationName: edit.pollingStationName || null,
          position: edit.position,
          formNumber: edit.formNumber.trim(),
          applicantType: edit.applicantType,
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
          Issue and register EA-level position forms — separate from the delegate nomination form system. Duplicate
          applicants (same phone + position + area) are blocked.
        </p>
      </header>

      <div className="ea-portal-panel ea-form-steps">
        <div className="ea-portal-panel-header">
          <h2>Issue a form</h2>
        </div>
        <form className="ea-portal-modal-body" onSubmit={submitIssue}>
          <div>
            <div className="ea-form-step-label">Step 1 · Electoral Area</div>
            <div className="form-group">
              <label>Electoral Area</label>
              <select
                className="select"
                required
                value={issue.electoralAreaId}
                onChange={(e) => onIssueAreaChange(e.target.value)}
              >
                <option value="">— Select —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.region}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 2 · Polling station (optional)</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', margin: '0 0 0.5rem' }}>
              Search the delegate <strong>polling_stations</strong> table. Results are limited to stations under the
              electoral area linked via this portal area&apos;s <em>delegate electoral code</em>.
            </p>
            <div className="form-group">
              <label>Search by station name or code</label>
              <input
                className="input"
                placeholder={issue.electoralAreaId ? 'Type at least 2 characters…' : 'Select an electoral area first'}
                value={stationQuery}
                onChange={(e) => setStationQuery(e.target.value)}
                disabled={!issue.electoralAreaId}
                autoComplete="off"
              />
              {stationSearchBusy ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Searching…</span>
              ) : null}
            </div>
            {issue.pollingStationCode ? (
              <div
                style={{
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>
                  Selected: <strong>{issue.pollingStationName}</strong> ({issue.pollingStationCode})
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setIssue((s) => ({ ...s, pollingStationCode: '', pollingStationName: '' }))
                  }
                >
                  Clear
                </button>
              </div>
            ) : null}
            {stationHits.length > 0 ? (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 1rem',
                  maxHeight: '12rem',
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
              >
                {stationHits.map((h) => (
                  <li key={h.code} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        borderRadius: 0,
                        border: 'none',
                        justifyContent: 'flex-start',
                      }}
                      onClick={() => {
                        setIssue((s) => ({
                          ...s,
                          pollingStationCode: h.code,
                          pollingStationName: h.name,
                        }));
                        setStationHits([]);
                        setStationQuery('');
                      }}
                    >
                      <span>
                        {h.name}{' '}
                        <span style={{ color: 'var(--gray-500)' }}>({h.code})</span>
                      </span>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray-500)' }}>
                        {h.electoralArea.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <div className="ea-form-step-label">Step 3 · Position</div>
            <div className="form-group">
              <label>Position applying for</label>
              <select
                className="select"
                required
                value={issue.position}
                onChange={(e) => setIssue((x) => ({ ...x, position: e.target.value }))}
              >
                <option value="">— Select —</option>
                {EA_PORTAL_FORM_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 4 · Applicant</div>
            <div className="grid-3">
              <div className="form-group">
                <label>Full name</label>
                <input
                  className="input"
                  required
                  value={issue.fullName}
                  onChange={(e) => setIssue((x) => ({ ...x, fullName: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  className="input"
                  required
                  value={issue.phone}
                  onChange={(e) => setIssue((x) => ({ ...x, phone: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Gender (optional)</label>
                <input
                  className="input"
                  value={issue.gender}
                  onChange={(e) => setIssue((x) => ({ ...x, gender: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Address (optional)</label>
              <input
                className="input"
                value={issue.address}
                onChange={(e) => setIssue((x) => ({ ...x, address: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <div className="ea-form-step-label">Step 5 · Form details</div>
            <div className="grid-3">
              <div className="form-group">
                <label>Form / serial number</label>
                <input
                  className="input"
                  required
                  value={issue.formNumber}
                  onChange={(e) => setIssue((x) => ({ ...x, formNumber: e.target.value }))}
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
              <div className="form-group">
                <label>Applicant type</label>
                <select
                  className="select"
                  value={issue.applicantType}
                  onChange={(e) =>
                    setIssue((x) => ({ ...x, applicantType: e.target.value as 'EXISTING' | 'NEW' }))
                  }
                >
                  <option value="NEW">New applicant</option>
                  <option value="EXISTING">Existing member</option>
                </select>
              </div>
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
          <div className="form-group" style={{ minWidth: '120px' }}>
            <label>Applicant type</label>
            <select className="select" value={fltType} onChange={(e) => setFltType(e.target.value)}>
              <option value="">All</option>
              <option value="NEW">New</option>
              <option value="EXISTING">Existing</option>
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
              placeholder="Name, phone, form #"
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
                  <th>Area</th>
                  <th>Position</th>
                  <th>Type</th>
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
                    <td>{r.electoralArea.name}</td>
                    <td style={{ fontSize: '0.8rem' }}>{r.position}</td>
                    <td>{r.applicantType === 'EXISTING' ? 'Existing' : 'New'}</td>
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
                  onChange={(e) => {
                    const id = e.target.value;
                    setEdit((x) => ({
                      ...x,
                      electoralAreaId: id,
                      pollingStationCode: '',
                      pollingStationName: '',
                    }));
                    setEditStationQuery('');
                    setEditStationHits([]);
                  }}
                >
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.region}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Polling station (optional — search delegate DB)</label>
                <input
                  className="input"
                  placeholder={edit.electoralAreaId ? 'Type at least 2 characters…' : '—'}
                  value={editStationQuery}
                  onChange={(e) => setEditStationQuery(e.target.value)}
                  disabled={!edit.electoralAreaId}
                  autoComplete="off"
                />
                {editStationSearchBusy ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Searching…</span>
                ) : null}
                {edit.pollingStationCode ? (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem' }}>
                      Selected: <strong>{edit.pollingStationName}</strong> ({edit.pollingStationCode})
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        setEdit((s) => ({ ...s, pollingStationCode: '', pollingStationName: '' }))
                      }
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                {editStationHits.length > 0 ? (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '0.5rem 0 0',
                      maxHeight: '10rem',
                      overflow: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                  >
                    {editStationHits.map((h) => (
                      <li key={h.code} style={{ borderBottom: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: 0,
                            border: 'none',
                            justifyContent: 'flex-start',
                          }}
                          onClick={() => {
                            setEdit((s) => ({
                              ...s,
                              pollingStationCode: h.code,
                              pollingStationName: h.name,
                            }));
                            setEditStationHits([]);
                            setEditStationQuery('');
                          }}
                        >
                          <span>
                            {h.name} <span style={{ color: 'var(--gray-500)' }}>({h.code})</span>
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray-500)' }}>
                            {h.electoralArea.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="form-group">
                <label>Position</label>
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
              <div className="grid-2">
                <div className="form-group">
                  <label>Full name</label>
                  <input
                    className="input"
                    required
                    value={edit.fullName}
                    onChange={(e) => setEdit((x) => ({ ...x, fullName: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    className="input"
                    required
                    value={edit.phone}
                    onChange={(e) => setEdit((x) => ({ ...x, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Gender</label>
                  <input
                    className="input"
                    value={edit.gender}
                    onChange={(e) => setEdit((x) => ({ ...x, gender: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Applicant type</label>
                  <select
                    className="select"
                    value={edit.applicantType}
                    onChange={(e) =>
                      setEdit((x) => ({ ...x, applicantType: e.target.value as 'EXISTING' | 'NEW' }))
                    }
                  >
                    <option value="NEW">New applicant</option>
                    <option value="EXISTING">Existing member</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  className="input"
                  value={edit.address}
                  onChange={(e) => setEdit((x) => ({ ...x, address: e.target.value }))}
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Form number</label>
                  <input
                    className="input"
                    required
                    value={edit.formNumber}
                    onChange={(e) => setEdit((x) => ({ ...x, formNumber: e.target.value }))}
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
    </>
  );
}
