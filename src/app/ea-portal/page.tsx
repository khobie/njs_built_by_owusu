'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EA_PORTAL_REFRESH_EVENT } from '@/lib/ea-portal-refresh';

type Dashboard = {
  totals: {
    electoralAreas: number;
    totalDelegates: number;
    formsIssued: number;
    returnedForms: number;
    pendingVetting: number;
    verifiedDelegates: number;
    rejectedDelegates: number;
    contests: number;
    unopposedPositions: number;
    newDelegates: number;
    oldDelegates: number;
    verificationRate: number;
    returnRate: number;
  };
  charts: {
    byArea: { areaId: string; areaName: string; region: string; count: number }[];
    byPosition: { position: string; count: number }[];
    delegateType: { type: string; count: number }[];
    vettingProgress: { label: string; count: number }[];
  };
};

function BarChart({
  items,
  labelKey,
  valueKey,
}: {
  items: { [k: string]: string | number }[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  return (
    <div className="ea-chart-bars">
      {items.map((item, idx) => (
        <div key={idx} className="ea-chart-row">
          <span className="ea-chart-label" title={String(item[labelKey])}>
            {String(item[labelKey])}
          </span>
          <div className="ea-chart-track">
            <div
              className="ea-chart-fill"
              style={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
            />
          </div>
          <span className="ea-chart-val">{item[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function EaPortalDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState('');
  const [full, setFull] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    const [dashRes, sessionRes] = await Promise.all([
      fetch('/api/ea-portal/dashboard', { cache: 'no-store', credentials: 'include' }),
      fetch('/api/auth/session', { credentials: 'include' }),
    ]);
    if (sessionRes.ok) {
      const j = await sessionRes.json();
      const r = j?.user?.role as string;
      setFull(
        r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'EA_PORTAL_ADMIN' || r === 'EA_DATA_ENTRY'
      );
    }
    if (!dashRes.ok) {
      const data = await dashRes.json().catch(() => ({}));
      setErr((data as { error?: string }).error || 'Could not load dashboard.');
      return;
    }
    setData(await dashRes.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => void load();
    window.addEventListener(EA_PORTAL_REFRESH_EVENT, fn);
    return () => window.removeEventListener(EA_PORTAL_REFRESH_EVENT, fn);
  }, [load]);

  const resetModule = async () => {
    if (
      !window.confirm(
        'Clear ALL Electoral Area delegates, records, and audit logs? Polling station delegates will NOT be affected.'
      )
    ) {
      return;
    }
    const res = await fetch('/api/ea-portal/admin/reset', { method: 'POST' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert((d as { error?: string }).error || 'Reset failed');
      return;
    }
    void load();
    window.dispatchEvent(new Event(EA_PORTAL_REFRESH_EVENT));
  };

  const t = data?.totals;

  return (
    <>
      <header className="ea-portal-header">
        <h1>Electoral Area Dashboard</h1>
        <p>
          Analytics for EA portal delegates and form issuing — separate from the polling-station nomination
          system.
        </p>
        <div className="ea-portal-actions" style={{ marginTop: '0.75rem' }}>
          <Link href="/electoral-area/forms" className="btn btn-primary btn-sm">
            Issue form
          </Link>
          <Link href="/ea-portal/vetting" className="btn btn-secondary btn-sm">
            Vetting panel
          </Link>
          <Link href="/ea-portal/reports" className="btn btn-secondary btn-sm">
            Reports
          </Link>
          {full ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void resetModule()}>
              Reset EA module data
            </button>
          ) : null}
        </div>
      </header>

      {err ? <p className="ea-inline-err">{err}</p> : null}

      {t ? (
        <>
          <div className="ea-portal-cards ea-portal-cards-dense">
            <div className="ea-portal-card">
              <h3>Total delegates</h3>
              <div className="value">{t.totalDelegates}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Forms issued</h3>
              <div className="value">{t.formsIssued}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Returned</h3>
              <div className="value">{t.returnedForms}</div>
              <span className="ea-card-sub">{t.returnRate}% return rate</span>
            </div>
            <div className="ea-portal-card">
              <h3>Pending vetting</h3>
              <div className="value">{t.pendingVetting}</div>
            </div>
            <div className="ea-portal-card accent-green">
              <h3>Verified</h3>
              <div className="value">{t.verifiedDelegates}</div>
              <span className="ea-card-sub">{t.verificationRate}% verified</span>
            </div>
            <div className="ea-portal-card accent-red">
              <h3>Rejected</h3>
              <div className="value">{t.rejectedDelegates}</div>
            </div>
            <div className="ea-portal-card accent-amber">
              <h3>Contests</h3>
              <div className="value">{t.contests}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Unopposed</h3>
              <div className="value">{t.unopposedPositions}</div>
            </div>
            <div className="ea-portal-card">
              <h3>New delegates</h3>
              <div className="value">{t.newDelegates}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Old delegates</h3>
              <div className="value">{t.oldDelegates}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Electoral areas</h3>
              <div className="value">{t.electoralAreas}</div>
            </div>
          </div>

          <div className="ea-portal-grid-2">
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>Delegates per area</h2>
              </div>
              <BarChart
                items={data.charts.byArea.slice(0, 12)}
                labelKey="areaName"
                valueKey="count"
              />
            </div>
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>Delegate type</h2>
              </div>
              <BarChart items={data.charts.delegateType} labelKey="type" valueKey="count" />
            </div>
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>Vetting progress</h2>
              </div>
              <BarChart items={data.charts.vettingProgress} labelKey="label" valueKey="count" />
            </div>
            <div className="ea-portal-panel">
              <div className="ea-portal-panel-header">
                <h2>By position</h2>
              </div>
              <BarChart
                items={data.charts.byPosition.slice(0, 8)}
                labelKey="position"
                valueKey="count"
              />
            </div>
          </div>
        </>
      ) : !err ? (
        <p style={{ padding: '2rem' }}>Loading dashboard…</p>
      ) : null}
    </>
  );
}
