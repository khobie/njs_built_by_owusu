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

      <div className="ea-portal-panel">
        <div className="ea-portal-panel-header">
          <h2>EA form issuing reports</h2>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', margin: '0 0 0.75rem' }}>
          Summary includes forms per area and contested positions. Detailed view lists every issued form in your scope.
        </p>
        <div className="ea-portal-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)' }}>Summary</span>
          <a
            className="btn btn-primary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href="/api/ea-portal/forms/reports/export?view=summary&format=csv"
            download={`ea_forms_summary_${stamp}.csv`}
          >
            Summary CSV
          </a>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href={`/api/ea-portal/forms/reports/export?view=summary&format=xls`}
            download={`ea_forms_summary_${stamp}.xls`}
          >
            Summary Excel (.xls)
          </a>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: '0.35rem' }}>Detailed</span>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href={`/api/ea-portal/forms/reports/export?view=detail&format=csv`}
            download={`ea_forms_detail_${stamp}.csv`}
          >
            Detailed CSV
          </a>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href={`/api/ea-portal/forms/reports/export?view=detail&format=xls`}
            download={`ea_forms_detail_${stamp}.xls`}
          >
            Detailed Excel (.xls)
          </a>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href="/api/ea-portal/forms/reports/export?view=detail&format=pdf"
            target="_blank"
            rel="noreferrer"
          >
            Detailed print / PDF
          </a>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: '0.35rem' }}>Contests only</span>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href={`/api/ea-portal/forms/reports/export?view=detail&contestsOnly=1&format=csv`}
            download={`ea_forms_contests_${stamp}.csv`}
          >
            Contested rows CSV
          </a>
          <a
            className="btn btn-secondary"
            style={{ display: 'inline-block', maxWidth: '320px', textAlign: 'center' }}
            href={`/api/ea-portal/forms/reports/export?view=detail&contestsOnly=1&format=pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Contested print / PDF
          </a>
        </div>
      </div>
    </>
  );
}
