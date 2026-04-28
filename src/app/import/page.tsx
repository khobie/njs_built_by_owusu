'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { notifyDashboardRefresh } from '@/lib/dashboard-refresh';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseTSV = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };

    // Detect delimiter: tab or comma
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }

    return { headers, rows };
  };

  const handleFile = useCallback((selectedFile: File) => {
    setError('');
    setImportResult(null);
    setCsvData([]);
    setHeaders([]);

    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.tsv') && !selectedFile.name.endsWith('.txt')) {
      setError('Please select a valid file (.csv, .tsv, or .txt)');
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const { headers, rows } = parseTSV(text);
        if (rows.length === 0) {
          setError('File appears to be empty or invalid');
          return;
        }
        setHeaders(headers);
        setCsvData(rows);
      } catch (err) {
        setError('Failed to parse file');
      }
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile]
  );

  const downloadTemplate = () => {
    const template = `surname\tfirstname\tmiddlename\tphone\tage\telectoralArea\tstation\tposition\tstatus
ANTWI\tSETH\tKWADWO\t550795011\t39\tANGLICAN\tST. MARY'S KINDARGATEN K'DUA\tSECRETARY\tOld Delegate
AGYEKUM-BOADU\tVALERIA\t\t243455466\t45\tOLD ESTATE EAST\tHOUSING CORP OFFICE OLD ESTATE 1\tSECRETARY\tOld Delegate
JULIET\tKONADU\t\t249991411\t68\tTWO STREAMS\tMETHODIST CHAPEL\tWOMEN ORGANIZER\tOld Delegate`;

    const blob = new Blob([template], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'candidate_import_template.tsv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (csvData.length === 0) return;

    setImporting(true);
    setImportResult(null);
    setError('');

    try {
      const candidates = csvData.map((row) => ({
        surname: row.surname || row.Surname || row.SURNAME || '',
        firstname: row.firstname || row.firstName || row['First Name'] || row['first_name'] || '',
        middlename: row.middlename || row.middleName || row['Middle Name'] || row['middle_name'] || '',
        phone: row.phone || row.Phone || row.phoneNumber || row['Phone Number'] || row['phone_number'] || '',
        age: row.age || row.Age || '',
        electoralArea: row.electoralArea || row['Electoral Area'] || row.electoral_area || row['electoral area'] || '',
        station: row.station || row.Station || row.STATION || row['Polling Station'] || row['polling_station'] || '',
        position: row.position || row.Position || row.POSITION || '',
        status: row.status || row.Status || row.STATUS || row['Delegate Type'] || row.delegateType || '',
      }));

      const res = await fetch('/api/candidates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportResult(data);
      if (data.imported > 0) notifyDashboardRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : 'Import failed'],
      });
    } finally {
      setImporting(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setCsvData([]);
    setHeaders([]);
    setImportResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <header className="header">
        <div
          className="container"
          style={{
            margin: 0,
            maxWidth: 'none',
            padding: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1>CSV Import</h1>
            <div className="header-subtitle">Bulk Upload Candidates from CSV/TSV</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-secondary" style={{ margin: 0 }}>
              ← Dashboard
            </Link>
            <Link href="/edit-candidate" className="btn btn-secondary" style={{ margin: 0 }}>
              Edit candidate
            </Link>
            <Link href="/vetting" className="btn btn-secondary" style={{ margin: 0 }}>
              Vetting →
            </Link>
            <Link href="/reports" className="btn btn-secondary" style={{ margin: 0 }}>
              📋 Reports
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        {error && <div className="error">{error}</div>}

        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Upload File</h2>
            <button
              type="button"
              onClick={downloadTemplate}
              style={{
                background: 'none',
                border: 'none',
                color: '#1E40AF',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              ⬇ Download Template
            </button>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `3px dashed ${dragActive ? '#DC2626' : '#D1D5DB'}`,
              borderRadius: '0.75rem',
              padding: '2.5rem 2rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragActive ? '#FEF2F2' : '#F9FAFB',
              transition: 'all 0.2s',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleChange}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📁</div>
            <p style={{ fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
              {dragActive ? 'Drop the file here' : 'Drag & drop a file here'}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              or click to browse files
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
              Supports .csv, .tsv, .txt (tab or comma separated)
            </p>
          </div>

          {file && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                background: '#EFF6FF',
                borderRadius: '0.5rem',
                border: '1px solid #93C5FD',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: '#1E40AF' }}>📄 {file.name}</span>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                  ({csvData.length} rows)
                </span>
              </div>
              <button
                onClick={clearFile}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#DC2626',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
                title="Remove file"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {csvData.length > 0 && (
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Preview</h2>
              <span className="badge badge-issued">{csvData.length} rows</span>
            </div>

            <div className="table-container" style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: '#6b7280' }}>{idx + 1}</td>
                      {headers.map((h) => (
                        <td key={h}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={clearFile}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : `Import ${csvData.length} Candidates`}
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div
            className="section"
            style={{
              borderLeftColor: importResult.imported > 0 ? '#10b981' : '#DC2626',
            }}
          >
            <div className="section-header">
              <h2 className="section-title">Import Result</h2>
              <span
                className="badge"
                style={{
                  background: importResult.imported > 0 ? '#D1FAE5' : '#FEF2F2',
                  color: importResult.imported > 0 ? '#065F46' : '#DC2626',
                  border: `1px solid ${importResult.imported > 0 ? '#6EE7B7' : '#FECACA'}`,
                }}
              >
                {importResult.imported > 0 ? '✓ Success' : '✕ Failed'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div
                style={{
                  padding: '1rem',
                  background: '#D1FAE5',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#065F46' }}>
                  {importResult.imported}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#047857', fontWeight: 600 }}>
                  Imported
                </div>
              </div>
              <div
                style={{
                  padding: '1rem',
                  background: '#FEF3C7',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#B45309' }}>
                  {importResult.skipped}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#D97706', fontWeight: 600 }}>
                  Skipped
                </div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div>
                <p style={{ color: '#DC2626', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Errors ({importResult.errors.length}):
                </p>
                <div
                  style={{
                    maxHeight: '200px',
                    overflow: 'auto',
                    background: '#FEF2F2',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    border: '1px solid #FECACA',
                  }}
                >
                  <ul style={{ fontSize: '0.85rem', color: '#DC2626', margin: 0, paddingLeft: '1.25rem' }}>
                    {importResult.errors.map((err, idx) => (
                      <li key={idx} style={{ marginBottom: '0.25rem' }}>
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {importResult.imported > 0 && (
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <Link href="/vetting" className="btn btn-primary">
                  Go to Vetting →
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

