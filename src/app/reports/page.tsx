'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ElectoralArea { id: string; name: string; code: string; }
interface PollingStation { name: string; code: string; electoralAreaId: string; }

interface CandidateReport {
  id: string;
  candidateId: string;
  candidate?: {
    id: string;
    formNumber: string;
    surname: string;
    firstName: string;
    middleName: string | null;
    electoralArea?: ElectoralArea;
    pollingStation?: PollingStation;
    position: string;
    status: string;
  };
  authorName: string;
  reportType: 'GENERAL' | 'RECOMMENDATION' | 'CONCERN' | 'RED_FLAG' | 'WARNING';
  content: string;
  isResolved: boolean;
  createdAt: string;
}

interface ReportFilters {
  search: string;
  reportType: string;
  status: string;
  isResolved: string;
  areaId: string;
  position: string;
  dateFrom: string;
  dateTo: string;
}

interface SlotMetrics {
  contestedSlots: number;
  unopposedSlots: number;
  vacantSlots: number;
}

const REPORT_TYPES = [
  { value: 'GENERAL', label: 'General', color: 'issued' },
  { value: 'RECOMMENDATION', label: 'Recommendation', color: 'pending' },
  { value: 'CONCERN', label: 'Concern', color: 'warning' },
  { value: 'RED_FLAG', label: 'Red Flag', color: 'danger' },
] as const;

export default function ReportsPage() {
  const [reports, setReports] = useState<CandidateReport[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [slotMetrics, setSlotMetrics] = useState<SlotMetrics | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [candidateReports, setCandidateReports] = useState<CandidateReport[]>([]);
  
  const [filters, setFilters] = useState<ReportFilters>(({
    search: '',
    reportType: '',
    status: '',
    isResolved: '',
    areaId: '',
    position: '',
    dateFrom: '',
    dateTo: '',
  }));

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.reportType) params.set('reportType', filters.reportType);
      if (filters.status) params.set('status', filters.status);
      if (filters.isResolved) params.set('isResolved', filters.isResolved);
      if (filters.areaId) params.set('areaId', filters.areaId);
      if (filters.position) params.set('position', filters.position);
      
      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCandidates(data);
      
      const allReports: CandidateReport[] = [];
      data.forEach((c: any) => {
        if (c.reports) {
          c.reports.forEach((r: CandidateReport) => {
            allReports.push({ ...r, candidate: c });
          });
        }
      });
      
      // Date filtering
      if (filters.dateFrom || filters.dateTo) {
        const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(0);
        const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
        to.setHours(23, 59, 59, 999);
        
        allReports.filter(r => {
          const d = new Date(r.createdAt);
          return d >= from && d <= to;
        });
      }
      
      allReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReports(allReports);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    fetch('/api/electoral-areas')
      .then(res => res.json())
      .then(setAreas)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/candidates/stats')
      .then((res) => res.json())
      .then((stats) => {
        setSlotMetrics({
          contestedSlots: stats.contestedSlots ?? stats.contestedCount ?? 0,
          unopposedSlots: stats.unopposedSlots ?? stats.unopposedCount ?? 0,
          vacantSlots: stats.vacantSlots ?? stats.vacantCount ?? 0,
        });
      })
      .catch(() => setSlotMetrics(null));
  }, []);

  useEffect(() => {
    const posSet = new Set(candidates.map(c => c.position).filter(Boolean));
    setPositions(Array.from(posSet).sort());
  }, [candidates]);

  const openModal = async (candidate: any) => {
    setSelectedCandidate(candidate);
    setShowModal(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/reports`);
      const data = await res.json();
      setCandidateReports(data);
    } catch (err) {
      console.error('Failed to load reports', err);
      setCandidateReports([]);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCandidate(null);
    setCandidateReports([]);
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const reportData = {
      authorName: formData.get('authorName') as string,
      reportType: formData.get('reportType') as string,
      content: formData.get('content') as string,
    };

    try {
      const res = await fetch(`/api/candidates/${selectedCandidate.id}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData),
      });
      if (!res.ok) throw new Error('Failed');

      const newReport = await res.json();
      setCandidateReports([newReport, ...candidateReports]);
      (e.target as HTMLFormElement).reset();
      fetchReports();
    } catch (err) {
      alert('Failed to create report');
    }
  };

  const toggleResolved = async (report: CandidateReport) => {
    try {
      const res = await fetch(`/api/candidates/${report.candidateId}/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isResolved: !report.isResolved }),
      });
      if (!res.ok) throw new Error('Failed');

      const updated = await res.json();
      setCandidateReports(candidateReports.map(r => r.id === updated.id ? updated : r));
      fetchReports();
    } catch (err) {
      alert('Failed to update');
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      const res = await fetch(`/api/candidates/${selectedCandidate?.id}/reports/${reportId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setCandidateReports(candidateReports.filter(r => r.id !== reportId));
      fetchReports();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      reportType: '',
      status: '',
      isResolved: '',
      areaId: '',
      position: '',
      dateFrom: '',
      dateTo: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  // Stats calculation
  const total = reports.length;
  const unresolved = reports.filter(r => !r.isResolved).length;
  const resolved = reports.filter(r => r.isResolved).length;
  const redFlags = reports.filter(r => r.reportType === 'RED_FLAG' && !r.isResolved).length;

  const statsByType = () => {
    return REPORT_TYPES.map(t => ({
      ...t,
      count: reports.filter(r => r.reportType === t.value).length,
    }));
  };

  // Export functions
  const exportCSV = () => {
    const headers = ['Date', 'Candidate', 'Form #', 'Area', 'Station', 'Position', 'Type', 'Author', 'Resolved', 'Content'];
    const rows = reports.map(r => [
      new Date(r.createdAt).toLocaleDateString(),
      `${r.candidate?.surname || ''}, ${r.candidate?.firstName || ''}`,
      r.candidate?.formNumber || '',
      r.candidate?.electoralArea?.name || '',
      r.candidate?.pollingStation?.name || '',
      r.candidate?.position || '',
      r.reportType,
      r.authorName,
      r.isResolved ? 'Yes' : 'No',
      `"${(r.content || '').replace(/"/g, '""')}"`,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reports-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportJSON = () => {
    const data = reports.map(r => ({
      date: r.createdAt,
      candidate: `${r.candidate?.surname || ''}, ${r.candidate?.firstName || ''}`,
      formNumber: r.candidate?.formNumber,
      area: r.candidate?.electoralArea?.name,
      station: r.candidate?.pollingStation?.name,
      position: r.candidate?.position,
      type: r.reportType,
      author: r.authorName,
      resolved: r.isResolved,
      content: r.content,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reports-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div>
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1>Reports Portal</h1>
              <div className="header-subtitle">Manage pre-vetting comments and candidate reports</div>
            </div>
            <div className="header-actions">
              <Link href="/" className="btn btn-secondary">← Dashboard</Link>
              <Link href="/vetting" className="btn btn-secondary">✅ Vetting</Link>
              <Link href="/import" className="btn btn-secondary">📥 Import</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card total"><h3>Total</h3><div className="value">{total}</div></div>
          <div className="stat-card pending"><h3>Unresolved</h3><div className="value">{unresolved}</div></div>
          <div className="stat-card approved"><h3>Resolved</h3><div className="value">{resolved}</div></div>
          <div className="stat-card danger"><h3>Red Flags</h3><div className="value">{redFlags}</div></div>
          <div className="stat-card contested"><h3>Contested Slots</h3><div className="value">{slotMetrics?.contestedSlots ?? 0}</div></div>
          <div className="stat-card unopposed"><h3>Unopposed Slots</h3><div className="value">{slotMetrics?.unopposedSlots ?? 0}</div></div>
          <div className="stat-card vacant"><h3>Vacant Slots</h3><div className="value">{slotMetrics?.vacantSlots ?? 0}</div></div>
        </div>

        {/* Report Type Distribution */}
        {statsByType().length > 0 && (
          <div className="section">
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Reports by Type</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {statsByType().map(type => (
                <div key={type.value} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ minWidth: '120px', fontSize: '0.875rem', fontWeight: '500' }}>{type.label}</div>
                  <div style={{ flex: 1, background: 'var(--gray-100)', borderRadius: '9999px', height: '8px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${total > 0 ? (type.count / total) * 100 : 0}%`,
                        height: '100%',
                        background: `var(--${type.color === 'issued' ? 'gray-400' : type.color === 'pending' ? 'warning' : type.color === 'danger' ? 'danger' : 'success'})`,
                        borderRadius: '9999px',
                      }}
                    />
                  </div>
                  <div style={{ minWidth: '2rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600' }}>
                    {type.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">All Reports</h2>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span className="badge badge-pending">{reports.length} total</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={exportCSV}>📊 Export CSV</button>
                <button className="btn btn-secondary btn-sm" onClick={exportJSON}>📄 Export JSON</button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="filters">
            <div className="filter-group">
              <label>Search</label>
              <input
                type="text"
                className="input"
                placeholder="Candidate name, form #, author, content..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>

            <div className="filter-group">
              <label>Report Type</label>
              <select
                className="select"
                value={filters.reportType}
                onChange={(e) => setFilters(prev => ({ ...prev, reportType: e.target.value }))}
              >
                <option value="">All Types</option>
                {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Candidate Status</label>
              <select
                className="select"
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All Statuses</option>
                <option value="IMPORTED">Imported</option>
                <option value="VETTED">Vetted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Resolution</label>
              <select
                className="select"
                value={filters.isResolved}
                onChange={(e) => setFilters(prev => ({ ...prev, isResolved: e.target.value }))}
              >
                <option value="">All</option>
                <option value="false">Unresolved</option>
                <option value="true">Resolved</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Electoral Area</label>
              <select
                className="select"
                value={filters.areaId}
                onChange={(e) => setFilters(prev => ({ ...prev, areaId: e.target.value }))}
              >
                <option value="">All Areas</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Position</label>
              <select
                className="select"
                value={filters.position}
                onChange={(e) => setFilters(prev => ({ ...prev, position: e.target.value }))}
              >
                <option value="">All Positions</option>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Date From</label>
              <input
                type="date"
                className="input"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>

            <div className="filter-group">
              <label>Date To</label>
              <input
                type="date"
                className="input"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>

            {hasActiveFilters && (
              <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={clearFilters}>
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Reports List */}
          {loading ? (
            <div className="loading">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="empty-state">No reports found</div>
          ) : (
            <div className="reports-list">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className={`report-card ${!report.isResolved ? 'unresolved' : ''} ${report.reportType === 'RED_FLAG' && !report.isResolved ? 'red-flag' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span className={`badge badge-${getReportTypeColor(report.reportType)}`}>
                        {getReportTypeLabel(report.reportType)}
                      </span>
                      <span className={`badge ${report.isResolved ? 'badge-approved' : 'badge-pending'}`}>
                        {report.isResolved ? '✓ Resolved' : '⏳ Pending'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {new Date(report.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                      {report.candidate ? (
                        <Link
                          href={`/vetting?selected=${report.candidate.id}`}
                          style={{ color: 'var(--primary)', textDecoration: 'none' }}
                          onClick={(e) => {
                            e.preventDefault();
                            const id = report.candidate!.id;
                            window.open(`/vetting?selected=${id}`, '_self');
                          }}
                        >
                          {report.candidate.surname}, {report.candidate.firstName} ({report.candidate.formNumber})
                        </Link>
                      ) : 'Unknown Candidate'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {report.content}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Reported by <strong>{report.authorName}</strong>
                      {report.candidate && (
                        <span style={{ marginLeft: '0.5rem' }}>
                          • {report.candidate.position} • {report.candidate.electoralArea?.name || 'Unknown Area'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className={`btn ${report.isResolved ? 'btn-secondary' : 'btn-success'} btn-sm`}
                        onClick={() => toggleResolved(report)}
                      >
                        {report.isResolved ? '↻ Reopen' : '✓ Resolve'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteReport(report.id)}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Candidate Reports Modal */}
      {showModal && selectedCandidate && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Reports: {selectedCandidate.surname}, {selectedCandidate.firstName}</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              {/* Add Report Form */}
              <form onSubmit={handleCreateReport} className="report-form">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Add New Report</h3>
                <div className="grid-2">
                  <div className="form-group">
                    <label>Your Name</label>
                    <input
                      type="text"
                      name="authorName"
                      className="input"
                      placeholder="Enter your name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Report Type</label>
                    <select name="reportType" className="select">
                      {REPORT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Comment</label>
                  <textarea
                    name="content"
                    className="input"
                    placeholder="Enter detailed comment or observation..."
                    rows={3}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  + Add Report
                </button>
              </form>

              {/* Existing Reports */}
              <div style={{ marginTop: '2rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                  Existing Reports ({candidateReports.length})
                </h3>
                {candidateReports.length === 0 ? (
                  <div className="empty-state" style={{ padding: '2rem' }}>No reports yet for this candidate</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {candidateReports.map((report) => (
                      <div
                        key={report.id}
                        className={`report-card-detail ${!report.isResolved ? 'unresolved' : ''}`}
                        style={{
                          padding: '1rem',
                          background: report.isResolved ? 'var(--gray-50)' : 'white',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          borderLeft: `4px solid ${getReportTypeColorValue(report.reportType)}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={`badge badge-${getReportTypeColor(report.reportType)}`}>
                              {getReportTypeLabel(report.reportType)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              by {report.authorName}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.875rem', lineHeight: '1.5', marginBottom: '0.75rem' }}>{report.content}</p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            className={`btn btn-sm ${report.isResolved ? 'btn-secondary' : 'btn-success'}`}
                            onClick={() => toggleResolved(report)}
                          >
                            {report.isResolved ? '↻ Reopen' : '✓ Resolve'}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteReport(report.id)}
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getReportTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'GENERAL': 'General',
    'RECOMMENDATION': 'Recommendation',
    'CONCERN': 'Concern',
    'RED_FLAG': 'Red Flag',
    'WARNING': 'Warning',
  };
  return labels[type] || type;
}

function getReportTypeColor(type: string): string {
  const colors: Record<string, string> = {
    'GENERAL': 'issued',
    'RECOMMENDATION': 'pending',
    'CONCERN': 'warning',
    'RED_FLAG': 'danger',
    'WARNING': 'danger',
  };
  return colors[type] || 'issued';
}

function getReportTypeColorValue(type: string): string {
  const colors: Record<string, string> = {
    'GENERAL': 'var(--gray-300)',
    'RECOMMENDATION': 'var(--warning)',
    'CONCERN': 'var(--warning)',
    'RED_FLAG': 'var(--danger)',
    'WARNING': 'var(--danger)',
  };
  return colors[type] || 'var(--gray-300)';
}
