'use client';

export default function EaPortalReportsPage() {
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <>
      <header className="ea-portal-header">
        <h1>Reports &amp; export</h1>
        <p>Download scoped summaries (records per area, activity data, polling links where configured).</p>
      </header>

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>Exports</h2>
        </div>
        <div className="ea-portal-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <a className="btn btn-primary" style={{ display: 'inline-block', maxWidth: '280px', textAlign: 'center' }} href="/api/ea-portal/reports/export?format=csv" download={`ea_portal_${stamp}.csv`}>
            Download CSV
          </a>
          <a className="btn btn-secondary" style={{ display: 'inline-block', maxWidth: '280px', textAlign: 'center' }} href="/api/ea-portal/reports/export?format=xls" download={`ea_portal_${stamp}.xls`}>
            Download Excel (.xls)
          </a>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '280px', textAlign: 'center' }}
            href="/api/ea-portal/reports/export?format=pdf"
            target="_blank"
            rel="noreferrer"
          >
            Open print / PDF view
          </a>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', margin: '0.5rem 0 0' }}>
            The print view opens in a new tab — use your browser’s <strong>Print → Save as PDF</strong>.
          </p>
        </div>
      </div>
    </>
  );
}
