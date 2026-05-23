'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EA_PORTAL_FORM_POSITIONS,
  EA_FORM_DELEGATE_TYPES,
  EA_FORM_NUMBER_MAX_LEN,
  EA_VOTER_ID_MAX_LEN,
  normalizeEaFormPhone,
  type EaFormDelegateType,
} from '@/lib/ea-portal-form-constants';
import { notifyEaPortalRefresh } from '@/lib/ea-portal-refresh';
import type { EaDelegateImportPayload } from '@/lib/ea-delegate-import';

type AreaOpt = {
  id: string;
  name: string;
  region: string;
  district?: string;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseFormNumber(raw: string) {
  return raw.replace(/[^A-Za-z0-9]/g, '').slice(0, EA_FORM_NUMBER_MAX_LEN);
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
  const [busyIssue, setBusyIssue] = useState(false);
  const [autoFormNumber, setAutoFormNumber] = useState(true);
  const [formNumLoading, setFormNumLoading] = useState(false);

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

  const [importOpen, setImportOpen] = useState(false);
  const [importQ, setImportQ] = useState('');
  const [importHits, setImportHits] = useState<EaDelegateImportPayload[]>([]);
  const [importApplying, setImportApplying] = useState<string | null>(null);

  const selectedAreaName = useMemo(
    () => areas.find((a) => a.id === issue.electoralAreaId)?.name ?? '',
    [areas, issue.electoralAreaId],
  );

  const refreshAutoFormNumber = useCallback(async (): Promise<string | null> => {
    setFormNumLoading(true);
    try {
      const res = await fetch('/api/ea-portal/forms/generate-form-number', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { formNumber: string };
      setIssue((s) => ({ ...s, formNumber: data.formNumber }));
      return data.formNumber;
    } finally {
      setFormNumLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFormNumber) void refreshAutoFormNumber();
  }, [autoFormNumber, refreshAutoFormNumber]);

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
              : 'Could not load electoral areas.'),
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
          'No electoral areas are set up yet. An admin can load them under EA Portal → Areas, or run database seed.',
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
    void loadAreas();
  }, [loadAreas]);

  useEffect(() => {
    if (!importOpen || importQ.trim().length < 2) {
      setImportHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const p = new URLSearchParams({ q: importQ.trim() });
        if (issue.electoralAreaId) p.set('electoralAreaId', issue.electoralAreaId);
        const res = await fetch(`/api/ea-portal/delegates/import-search?${p}`, {
          credentials: 'include',
        });
        if (res.ok) setImportHits(await res.json());
        else setImportHits([]);
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [importOpen, importQ, issue.electoralAreaId]);

  const resetIssueForm = useCallback(
    (opts?: { keepArea?: boolean; refreshCode?: boolean }) => {
      setIssue((prev) => ({
        electoralAreaId: opts?.keepArea !== false ? prev.electoralAreaId : '',
        formNumber: '',
        phone: '',
        voterId: '',
        surname: '',
        firstName: '',
        middleName: '',
        position: '',
        delegateType: 'NEW',
        comment: '',
        dateIssued: todayDate(),
        sourceCandidateId: '',
      }));
      if (opts?.refreshCode !== false && autoFormNumber) {
        void refreshAutoFormNumber();
      }
    },
    [autoFormNumber, refreshAutoFormNumber],
  );

  const onIssueAreaChange = (areaId: string) => {
    setIssue((s) => ({ ...s, electoralAreaId: areaId }));
  };

  const applyImport = async (hit: EaDelegateImportPayload) => {
    setImportApplying(hit.id);
    try {
      const res = await fetch(
        `/api/ea-portal/delegates/import-search?candidateId=${encodeURIComponent(hit.id)}`,
        { credentials: 'include' },
      );
      const full: EaDelegateImportPayload = res.ok ? await res.json() : hit;
      const position = full.eaPosition || full.position;
      const useFormNumber = full.suggestedFormNumber;

      setIssue((s) => ({
        ...s,
        surname: full.surname,
        firstName: full.firstName,
        middleName: full.middleName ?? '',
        phone: full.phone,
        delegateType: full.delegateType === 'OLD' ? 'OLD' : 'NEW',
        position: position || s.position,
        comment: full.comment,
        dateIssued: full.dateNominated || s.dateIssued,
        sourceCandidateId: full.id,
        formNumber: useFormNumber ?? s.formNumber,
      }));
      setAutoFormNumber(!useFormNumber);

      setToast({
        type: 'ok',
        text: `Imported ${full.firstName} ${full.surname} — review the form and submit.`,
      });
      setImportOpen(false);
      setImportQ('');
      setImportHits([]);
    } catch {
      setToast({ type: 'err', text: 'Could not load full delegate record for import.' });
    } finally {
      setImportApplying(null);
    }
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

    let fn = parseFormNumber(issue.formNumber);
    if (autoFormNumber) {
      if (!/^[A-Za-z0-9]{1,6}$/.test(fn)) {
        const generated = await refreshAutoFormNumber();
        fn = parseFormNumber(generated ?? '');
      }
      if (!/^[A-Za-z0-9]{1,6}$/.test(fn)) {
        setToast({ type: 'err', text: 'Could not generate a form number. Try again.' });
        return;
      }
    } else if (!/^[A-Za-z0-9]{1,6}$/.test(fn)) {
      setToast({
        type: 'err',
        text: `Form number must be 1–${EA_FORM_NUMBER_MAX_LEN} letters or digits (e.g. 1A12E7).`,
      });
      return;
    }

    setBusyIssue(true);
    try {
      const res = await fetch('/api/ea-portal/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          surname: issue.surname.trim(),
          firstName: issue.firstName.trim(),
          middleName: issue.middleName.trim() || null,
          phone: normalizeEaFormPhone(issue.phone),
          voterId: issue.voterId.trim() || null,
          electoralAreaId: issue.electoralAreaId,
          position: issue.position,
          formNumber: fn,
          delegateType: issue.delegateType,
          comment: issue.comment.trim() || null,
          sourceCandidateId: issue.sourceCandidateId || null,
          issuedAt: issue.dateIssued ? `${issue.dateIssued}T12:00:00.000Z` : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ type: 'err', text: (data as { error?: string }).error || 'Could not issue form.' });
        if (autoFormNumber) void refreshAutoFormNumber();
        return;
      }
      const created = data as { formNumber?: string };
      setToast({
        type: 'ok',
        text: created.formNumber
          ? `Form ${created.formNumber} issued successfully.`
          : 'Form issued successfully.',
      });
      resetIssueForm({ keepArea: true });
      notifyEaPortalRefresh();
    } finally {
      setBusyIssue(false);
    }
  };

  const displayFormNumber =
    formNumLoading && autoFormNumber && !issue.formNumber ? 'Generating…' : issue.formNumber;

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
          Register delegates by electoral area and position. The form code is shown below before you submit.
          View or export issued forms from Reports.
        </p>
        <div className="ea-form-issue-header-actions">
          <Link href="/ea-portal/reports" className="btn btn-secondary btn-sm">
            Reports &amp; export
          </Link>
          <Link href="/ea-portal/vetting" className="btn btn-secondary btn-sm">
            Vetting panel
          </Link>
        </div>
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
              {selectedAreaName ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', margin: '0.35rem 0 0' }}>
                  Issuing for: <strong>{selectedAreaName}</strong>
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
                    onChange={(e) => {
                      const on = e.target.checked;
                      setAutoFormNumber(on);
                      if (on) void refreshAutoFormNumber();
                      else setIssue((x) => ({ ...x, formNumber: '' }));
                    }}
                  />
                  Auto-generate
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'stretch' }}>
                  <input
                    className={`input${autoFormNumber ? ' ea-form-number-preview' : ''}`}
                    required
                    readOnly={autoFormNumber}
                    maxLength={EA_FORM_NUMBER_MAX_LEN}
                    autoComplete="off"
                    placeholder={autoFormNumber ? 'Auto code' : 'e.g. 1A12E7'}
                    value={displayFormNumber}
                    onChange={(e) =>
                      setIssue((x) => ({
                        ...x,
                        formNumber: parseFormNumber(e.target.value),
                      }))
                    }
                    style={
                      autoFormNumber
                        ? {
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            fontFamily: 'ui-monospace, monospace',
                          }
                        : undefined
                    }
                  />
                  {autoFormNumber ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={formNumLoading || busyIssue}
                      title="Generate a different code"
                      onClick={() => void refreshAutoFormNumber()}
                    >
                      New
                    </button>
                  ) : null}
                </div>
                {autoFormNumber && issue.formNumber && !formNumLoading ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', margin: '0.35rem 0 0' }}>
                    This code will be saved when you issue the form. Use <strong>New</strong> to change it before
                    submit.
                  </p>
                ) : null}
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

          <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={busyIssue || (autoFormNumber && formNumLoading)}>
              {busyIssue ? 'Submitting…' : 'Issue form'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyIssue}
              onClick={() => resetIssueForm({ keepArea: true })}
            >
              Clear form
            </button>
          </div>
        </form>
      </div>

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
                Search the nomination delegate database. Selecting a row fills the form with name, phone,
                position, comment (including reports and vetting notes), and other submitted details.
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
              <ul style={{ listStyle: 'none', padding: 0, maxHeight: '18rem', overflow: 'auto' }}>
                {importHits.map((h) => (
                  <li key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: 0 }}
                      disabled={importApplying !== null}
                      onClick={() => void applyImport(h)}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {h.surname} {h.firstName}
                        {h.middleName ? ` ${h.middleName}` : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>
                        {h.phone} · Form #{h.nominationFormNumber} · {h.eaPosition || h.position}
                      </span>
                      {importApplying === h.id ? (
                        <span style={{ display: 'block', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                          Loading…
                        </span>
                      ) : null}
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
