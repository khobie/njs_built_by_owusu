'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EA_PORTAL_FORM_POSITIONS, EA_FORM_STATUSES, EA_FORM_DELEGATE_TYPES } from '@/lib/ea-portal-form-constants';
import { EA_PORTAL_REFRESH_EVENT } from '@/lib/ea-portal-refresh';

type AreaOpt = { id: string; name: string; region: string };
type ReportData = {
  summary: {
    totalDelegates: number;
    returned: number;
    verified: number;
    rejected: number;
    pendingVetting: number;
    contests: number;
    unopposed: number;
    newDelegates: number;
    oldDelegates: number;
    verificationRate: number;
    returnRate: number;
  };
  byArea: {
    areaId: string;
    areaName: string;
    region: string;
    issued: number;
    returned: number;
    verified: number;
    rejected: number;
    pending: number;
    total: number;
    contests: number;
  }[];
  rows: {
    id: string;
    formNumber: string;
    fullName: string;
    phone: string;
    delegateType: string;
    position: string;
    status: string;
    pollingStationName: string;
    electoralAreaName: string;
  }[];
  filteredCount: number;
};

export default function EaPortalReportsPage() {
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fltArea, setFltArea] = useState('');
  const [fltStation, setFltStation] = useState('');
  const [fltPosition, setFltPosition] = useState('');
  const [fltType, setFltType] = useState('');
  const [fltStatus, setFltStatus] = useState('');
  const [fltContest, setFltContest] = useState(false);
  const [fltUnopposed, setFltUnopposed] = useState(false);
  const [stations, setStations] = useState<{ code: string; name: string }[]>([]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (fltArea) p.set('electoralAreaId', fltArea);
    if (fltStation) p.set('pollingStationCode', fltStation);
    if (fltPosition) p.set('position', fltPosition);
    if (fltType) p.set('delegateType', fltType);
    if (fltStatus) p.set('status', fltStatus);
    if (fltContest) p.set('contestOnly', '1');
    if (fltUnopposed) p.set('unopposedOnly', '1');
    return p.toString();
  }, [fltArea, fltStation, fltPosition, fltType, fltStatus, fltContest, fltUnopposed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ea-portal/reports/analytics?${queryString}`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetch('/api/ea-portal/areas', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: AreaOpt[]) => setAreas(raw));
  }, []);

  useEffect(() => {
    if (!fltArea) {
      setStations([]);
      setFltStation('');
      return;
    }
    void fetch(`/api/ea-portal/polling-stations/list?eaPortalAreaId=${fltArea}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setStations);
  }, [fltArea]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => void load();
    window.addEventListener(EA_PORTAL_REFRESH_EVENT, fn);
    return () => window.removeEventListener(EA_PORTAL_REFRESH_EVENT, fn);
  }, [load]);

  const stamp = new Date().toISOString().slice(0, 10);
  const exportBase = `/api/ea-portal/forms/reports/export?view=detail&${queryString}`;
  const s = data?.summary;

  return (
    <>
      <header className="ea-portal-header mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reports &amp; analytics</h1>
        <p className="text-slate-600 text-sm mt-1 max-w-2xl">
          Filter Electoral Area delegates, view summary metrics, and export CSV, Excel, or print/PDF.
          Polling-station nomination data is not included.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Filters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Electoral area</label>
            <select className="select mt-1 w-full" value={fltArea} onChange={(e) => setFltArea(e.target.value)}>
              <option value="">All</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Polling station</label>
            <select
              className="select mt-1 w-full"
              value={fltStation}
              disabled={!fltArea}
              onChange={(e) => setFltStation(e.target.value)}
            >
              <option value="">All</option>
              {stations.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Position</label>
            <select className="select mt-1 w-full" value={fltPosition} onChange={(e) => setFltPosition(e.target.value)}>
              <option value="">All</option>
              {EA_PORTAL_FORM_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Delegate type</label>
            <select className="select mt-1 w-full" value={fltType} onChange={(e) => setFltType(e.target.value)}>
              <option value="">All</option>
              {EA_FORM_DELEGATE_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt === 'NEW' ? 'New' : 'Old'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select className="select mt-1 w-full" value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
              <option value="">All</option>
              {EA_FORM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 pt-6">
            <input type="checkbox" checked={fltContest} onChange={(e) => setFltContest(e.target.checked)} />
            Contest only
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 pt-6">
            <input type="checkbox" checked={fltUnopposed} onChange={(e) => setFltUnopposed(e.target.checked)} />
            Unopposed only
          </label>
        </div>
      </div>

      {loading || !s ? (
        <p className="text-slate-500">Loading report data…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {[
              ['Total delegates', s.totalDelegates],
              ['Returned', `${s.returned} (${s.returnRate}%)`],
              ['Verified', `${s.verified} (${s.verificationRate}%)`],
              ['Rejected', s.rejected],
              ['Pending vetting', s.pendingVetting],
              ['Contests', s.contests],
              ['Unopposed', s.unopposed],
              ['New delegates', s.newDelegates],
              ['Old delegates', s.oldDelegates],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{val}</div>
              </div>
            ))}
          </div>

          <div className="ea-portal-panel mb-6">
            <div className="ea-portal-panel-header">
              <h2>Electoral area summary</h2>
              <span className="text-sm text-slate-500">{data.filteredCount} rows in current filter</span>
            </div>
            <div className="ea-portal-table-wrap">
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Total</th>
                    <th>Issued</th>
                    <th>Returned</th>
                    <th>Verified</th>
                    <th>Rejected</th>
                    <th>Pending</th>
                    <th>Contests</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byArea.map((a) => (
                    <tr key={a.areaId}>
                      <td>{a.areaName}</td>
                      <td>{a.total}</td>
                      <td>{a.issued}</td>
                      <td>{a.returned}</td>
                      <td>{a.verified}</td>
                      <td>{a.rejected}</td>
                      <td>{a.pending}</td>
                      <td>{a.contests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ea-portal-panel mb-6">
            <div className="ea-portal-panel-header">
              <h2>Delegate rows (preview)</h2>
            </div>
            <div className="ea-portal-table-wrap" style={{ maxHeight: '20rem' }}>
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Form #</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Area</th>
                    <th>Station</th>
                    <th>Position</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 100).map((r) => (
                    <tr key={r.id}>
                      <td>{r.formNumber}</td>
                      <td>{r.fullName}</td>
                      <td>{r.phone}</td>
                      <td>{r.electoralAreaName}</td>
                      <td style={{ fontSize: '0.75rem' }}>{r.pollingStationName}</td>
                      <td style={{ fontSize: '0.75rem' }}>{r.position}</td>
                      <td>{r.delegateType}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.rows.length > 100 ? (
              <p className="text-xs text-slate-500 p-3">Showing first 100 of {data.rows.length} — use export for full list.</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Export</h2>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-primary btn-sm" href={`${exportBase}&format=csv`} download={`ea_report_${stamp}.csv`}>
                CSV
              </a>
              <a className="btn btn-secondary btn-sm" href={`${exportBase}&format=xls`} download={`ea_report_${stamp}.xls`}>
                Excel
              </a>
              <a className="btn btn-secondary btn-sm" href={`${exportBase}&format=pdf`} target="_blank" rel="noreferrer">
                Print / PDF
              </a>
              <a
                className="btn btn-secondary btn-sm"
                href={`/api/ea-portal/forms/reports/export?view=summary&format=csv&${queryString}`}
                download={`ea_summary_${stamp}.csv`}
              >
                Area summary CSV
              </a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
