'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Row = {
  id: string;
  fullName: string;
  formNumber: string;
  phone: string;
  position: string;
  electoralArea: { name: string };
};

export default function EaPortalContestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ea-portal/forms?contestOnly=1', { cache: 'no-store' });
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className="ea-portal-header">
        <h1>Contest monitoring</h1>
        <p>
          A contest exists when more than one delegate applies for the same{' '}
          <strong>electoral area + position</strong>.
        </p>
        <Link href="/ea-portal/vetting?contestOnly=1" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
          Open in vetting panel
        </Link>
      </header>
      <div className="ea-portal-panel">
        <div className="ea-portal-table-wrap">
          {loading ? (
            <p style={{ padding: '1rem' }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ padding: '1rem' }}>No contested slots.</p>
          ) : (
            <table className="ea-portal-table">
              <thead>
                <tr>
                  <th>Form #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Area</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.formNumber}</td>
                    <td>{r.fullName}</td>
                    <td>{r.phone}</td>
                    <td>{r.electoralArea.name}</td>
                    <td>{r.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
