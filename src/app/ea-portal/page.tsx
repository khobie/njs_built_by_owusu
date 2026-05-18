'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EA_PORTAL_REFRESH_EVENT } from '@/lib/ea-portal-refresh';

type Dashboard = {
  totals: {
    electoralAreas: number;
    records: number;
    unassignedRecords: number;
    formsIssued: number;
    formsPending: number;
    formsVerified: number;
    formsRejected: number;
    formContestPositions: number;
    formUnopposedPositions: number;
  };
  recordsPerArea: { areaId: string; areaName: string; region: string; count: number }[];
  formsPerArea: { areaId: string; areaName: string; region: string; count: number }[];
  recentForms: {
    id: string;
    fullName: string;
    position: string;
    formNumber: string;
    status: string;
    issuedAt: string;
    electoralArea: { id: string; name: string } | null;
  }[];
  recentRecords: {
    id: string;
    fullName: string;
    role: string;
    phone: string;
    createdAt: string;
    electoralArea: { id: string; name: string } | null;
  }[];
  recentActivity: {
    id: string;
    action: string;
    details: string | null;
    createdAt: string;
    area: { id: string; name: string } | null;
    record: { id: string; fullName: string } | null;
  }[];
};

export default function EaPortalDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    const res = await fetch('/api/ea-portal/dashboard', { cache: 'no-store' });
    if (!res.ok) {
      setErr('Could not load dashboard.');
      return;
    }
    setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => void load();
    window.addEventListener(EA_PORTAL_REFRESH_EVENT, fn);
    return () => window.removeEventListener(EA_PORTAL_REFRESH_EVENT, fn);
  }, [load]);

  return (
    <>
      <header className="ea-portal-header">
        <h1>Electoral Area Portal</h1>
        <p>
          Executive records, form issuing, assignments, and area structure — separate from the delegate nomination
          database.
        </p>
        <div style={{ marginTop: '0.75rem' }}>
          <Link href="/electoral-area/forms" className="btn btn-primary btn-sm">
            Open form issuing
          </Link>
        </div>
      </header>

      {err ? <div className="error">{err}</div> : null}

      {data && (
        <>
          <div className="ea-portal-cards">
            <div className="ea-portal-card">
              <h3>Electoral areas</h3>
              <div className="value">{data.totals.electoralAreas}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Total records</h3>
              <div className="value">{data.totals.records}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Unassigned</h3>
              <div className="value" style={{ color: 'var(--warning)' }}>
                {data.totals.unassignedRecords}
              </div>
            </div>
            <div className="ea-portal-card">
              <h3>EA forms issued</h3>
              <div className="value">{data.totals.formsIssued}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Pending forms</h3>
              <div className="value">{data.totals.formsPending}</div>
            </div>
            <div className="ea-portal-card">
              <h3>Verified</h3>
              <div className="value" style={{ color: '#15803d' }}>
                {data.totals.formsVerified}
              </div>
            </div>
            <div className="ea-portal-card">
              <h3>Rejected</h3>
              <div className="value" style={{ color: '#b91c1c' }}>
                {data.totals.formsRejected}
              </div>
            </div>
            <div className="ea-portal-card">
              <h3>Contest positions</h3>
              <div className="value">{data.totals.formContestPositions}</div>
              <p style={{ fontSize: '0.7rem', color: 'var(--gray-500)', margin: '0.35rem 0 0' }}>
                Area + position with &gt;1 applicant
              </p>
            </div>
            <div className="ea-portal-card">
              <h3>Unopposed positions</h3>
              <div className="value">{data.totals.formUnopposedPositions}</div>
              <p style={{ fontSize: '0.7rem', color: 'var(--gray-500)', margin: '0.35rem 0 0' }}>
                Exactly one applicant
              </p>
            </div>
          </div>

          <div className="ea-portal-panel">
            <div className="ea-portal-panel-header">
              <h2>Forms per electoral area</h2>
              <Link href="/electoral-area/forms" className="btn btn-secondary btn-sm">
                Form issuing →
              </Link>
            </div>
            <div className="ea-portal-table-wrap">
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Region</th>
                    <th>Forms issued</th>
                  </tr>
                </thead>
                <tbody>
                  {data.formsPerArea.map((r) => (
                    <tr key={`f-${r.areaId}`}>
                      <td>{r.areaName}</td>
                      <td>{r.region}</td>
                      <td>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ea-portal-panel">
            <div className="ea-portal-panel-header">
              <h2>Recent form issues</h2>
            </div>
            <div className="ea-portal-table-wrap">
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Form #</th>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Area</th>
                    <th>Status</th>
                    <th>Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentForms.map((r) => (
                    <tr key={r.id}>
                      <td>{r.formNumber}</td>
                      <td>{r.fullName}</td>
                      <td style={{ fontSize: '0.8rem' }}>{r.position}</td>
                      <td>{r.electoralArea?.name ?? '—'}</td>
                      <td>{r.status}</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                        {new Date(r.issuedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ea-portal-panel">
            <div className="ea-portal-panel-header">
              <h2>Records per area</h2>
              <Link href="/ea-portal/reassign" className="btn btn-secondary btn-sm">
                Reassign →
              </Link>
            </div>
            <div className="ea-portal-table-wrap">
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Region</th>
                    <th>Records</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.recordsPerArea.map((r) => (
                    <tr key={r.areaId}>
                      <td>{r.areaName}</td>
                      <td>{r.region}</td>
                      <td>{r.count}</td>
                      <td>
                        <Link href={`/ea-portal/areas/${r.areaId}`} className="btn btn-secondary btn-sm">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ea-portal-panel">
            <div className="ea-portal-panel-header">
              <h2>Recently added records</h2>
              <Link href="/ea-portal/records" className="btn btn-secondary btn-sm">
                All records
              </Link>
            </div>
            <div className="ea-portal-table-wrap">
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Area</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRecords.map((r) => (
                    <tr key={r.id}>
                      <td>{r.fullName}</td>
                      <td>{r.role}</td>
                      <td>{r.electoralArea?.name ?? '— unassigned —'}</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ea-portal-panel">
            <div className="ea-portal-panel-header">
              <h2>Recent activity</h2>
            </div>
            <div className="ea-portal-table-wrap">
              <table className="ea-portal-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((a) => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </td>
                      <td>{a.action}</td>
                      <td style={{ color: 'var(--gray-600)' }}>
                        {a.details || a.area?.name || a.record?.fullName || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
