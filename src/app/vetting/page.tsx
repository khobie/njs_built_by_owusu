'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifyDashboardRefresh } from '@/lib/dashboard-refresh';

interface ElectoralArea { id: string; name: string; code: string; }
interface PollingStation { name: string; code: string; electoralAreaId: string; }
interface CandidateReport { id: string; candidateId: string; authorName: string; reportType: string; content: string; createdAt: string; }
interface VettingQuestionResponse { id: string; candidateId: string; questionKey: string; question: string; response: boolean; notes: string | null; verifiedBy: string; createdAt: string; }
interface Candidate {
  id: string;
  formNumber: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  phoneNumber: string;
  age: number | null;
  electoralAreaId: string;
  pollingStationCode: string | null;
  position: string;
  delegateType: string;
  comment: string | null;
  status: string;
  verificationStatus: string;
  contestStatus: string;
  createdAt: string;
  electoralArea?: ElectoralArea;
  pollingStation?: PollingStation;
  reports?: CandidateReport[];
  vettingQuestions?: VettingQuestionResponse[];
}
interface Stats { totalCandidates: number; importedCount: number; vettedCount: number; approvedCount: number; rejectedCount: number; unopposedCount: number; contestedCount: number; vacantCount: number; byElectoralArea: any[]; }

export default function VettingPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [allStations, setAllStations] = useState<PollingStation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Filters
  const [filterArea, setFilterArea] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterContest, setFilterContest] = useState('');
  const [filterHasErrors, setFilterHasErrors] = useState(false);
  const [positions, setPositions] = useState<string[]>([]);
  
  // Detail panel
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ electoralAreaId: '', pollingStationCode: '' });
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  
  // Edit form
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editStations, setEditStations] = useState<PollingStation[]>([]);

  // Vetting questions
  const [vettingQuestions, setVettingQuestions] = useState<VettingQuestionResponse[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const fetchCandidates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterArea) params.set('areaId', filterArea);
      if (filterStation) params.set('stationCode', filterStation);
      if (filterPosition) params.set('position', filterPosition);
      if (filterStatus) params.set('status', filterStatus);
      if (filterContest) params.set('contestStatus', filterContest);
      if (filterHasErrors) params.set('hasErrors', 'true');
      
      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCandidates(data);
      const posSet = new Set<string>();
      data.forEach((c: Candidate) => c.position && posSet.add(c.position));
      setPositions(Array.from(posSet).sort());
    } catch (err) { console.error('Error:', err); }
  }, [search, filterArea, filterStation, filterPosition, filterStatus, filterContest, filterHasErrors]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/candidates/stats');
      if (!res.ok) throw new Error('Failed');
      setStats(await res.json());
    } catch (err) { console.error('Error:', err); }
  }, []);

  const fetchAreas = useCallback(async () => {
    try {
      const res = await fetch('/api/electoral-areas');
      if (!res.ok) throw new Error('Failed');
      setAreas(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  const fetchAllStations = useCallback(async () => {
    try {
      const res = await fetch('/api/polling-stations');
      if (!res.ok) throw new Error('Failed');
      setAllStations(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  const fetchStations = useCallback(async (areaId: string) => {
    try {
      const res = await fetch(`/api/polling-stations?areaId=${areaId}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStations(data);
      setEditStations(data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchVettingQuestions = useCallback(async (candidateId: string) => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/vetting`);
      if (!res.ok) throw new Error('Failed');
      return await res.json();
    } catch (err) {
      console.error('Error fetching vetting questions:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchCandidates(), fetchAreas(), fetchAllStations(), fetchStats()]);
      setLoading(false);
    }
    init();
  }, [fetchCandidates, fetchAreas, fetchAllStations, fetchStats]);

  useEffect(() => { fetchCandidates(); }, [search, filterArea, filterStation, filterPosition, filterStatus, filterContest, filterHasErrors, fetchCandidates]);

  useEffect(() => {
    if (filterArea) { fetchStations(filterArea); setFilterStation(''); } else { setStations([]); setFilterStation(''); }
  }, [filterArea, fetchStations]);

  const openPanel = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setPanelOpen(true);
    setCorrectionForm({ electoralAreaId: candidate.electoralAreaId, pollingStationCode: candidate.pollingStationCode || '' });
    setEditForm({
      formNumber: candidate.formNumber,
      surname: candidate.surname,
      firstName: candidate.firstName,
      middleName: candidate.middleName || '',
      phoneNumber: candidate.phoneNumber,
      age: candidate.age?.toString() || '',
      position: candidate.position,
      electoralAreaId: candidate.electoralAreaId,
      pollingStationCode: candidate.pollingStationCode || '',
      delegateType: candidate.delegateType,
      comment: candidate.comment || '',
    });
    fetchStations(candidate.electoralAreaId);
    
    // Fetch vetting questions
    setLoadingQuestions(true);
    const questions = await fetchVettingQuestions(candidate.id);
    setVettingQuestions(questions);
    setLoadingQuestions(false);
  };

  const closePanel = () => { setPanelOpen(false); setSelectedCandidate(null); setCorrectionError(''); setVettingQuestions([]); };

  const handleAction = async (id: string, action: 'verify' | 'approve' | 'reject') => {
    setSavingId(id);
    try {
      const endpoint = action === 'verify' ? `/api/candidates/${id}/verify` : action === 'approve' ? `/api/candidates/${id}/approve` : `/api/candidates/${id}/reject`;
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || `Failed`);
        return;
      }
      await Promise.all([fetchCandidates(), fetchStats()]);
      notifyDashboardRefresh();
      if (selectedCandidate?.id === id) { setSelectedCandidate(null); setPanelOpen(false); }
    } catch (err) { alert('Error'); }
    finally { setSavingId(null); }
  };

  const handleDeleteCandidate = async (id: string) => {
    const confirmed = window.confirm('Delete this candidate record permanently? This action cannot be undone.');
    if (!confirmed) return;

    setSavingId(id);
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data?.error === 'string' ? data.error : 'Failed to delete candidate');
        return;
      }
      await Promise.all([fetchCandidates(), fetchStats()]);
      notifyDashboardRefresh();
      if (selectedCandidate?.id === id) {
        setPanelOpen(false);
        setSelectedCandidate(null);
      }
    } catch {
      alert('Error deleting candidate');
    } finally {
      setSavingId(null);
    }
  };

  const saveEdit = async () => {
    if (!selectedCandidate) return;
    setSavingId(selectedCandidate.id);
    try {
      const payload: Record<string, unknown> = { ...editForm };
      if (editForm.age) payload.age = parseInt(editForm.age, 10);
      const res = await fetch(`/api/candidates/${selectedCandidate.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Failed');
      await Promise.all([fetchCandidates(), fetchStats()]);
      notifyDashboardRefresh();
      setPanelOpen(false);
    } catch (err) { alert('Failed to save'); }
    finally { setSavingId(null); }
  };

  const handleCorrectionChange = (field: string, value: string) => {
    setCorrectionForm(prev => ({ ...prev, [field]: value }));
    if (field === 'electoralAreaId') setCorrectionForm(prev => ({ ...prev, pollingStationCode: '' }));
  };

  const saveCorrections = async () => {
    if (!selectedCandidate) return;
    setSavingCorrection(true);
    setCorrectionError('');
    try {
      const res = await fetch(`/api/candidates/${selectedCandidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electoralAreaId: correctionForm.electoralAreaId, pollingStationCode: correctionForm.pollingStationCode || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      await Promise.all([fetchCandidates(), fetchStats()]);
      notifyDashboardRefresh();
      setPanelOpen(false);
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'Error');
    } finally { setSavingCorrection(false); }
  };

  const getAreaName = (id: string) => areas.find(a => a.id === id)?.name || id;
  const getStationName = (code: string | null) => { if (!code) return 'Not set'; return allStations.find(s => s.code === code)?.name || code; };

  const exportVettingData = () => {
    const rows = candidates
      .map((c) => ({
        formNumber: c.formNumber,
        fullName: formatName(c),
        phoneNumber: c.phoneNumber,
        electoralArea: getAreaName(c.electoralAreaId),
        pollingStationName: getStationName(c.pollingStationCode),
        pollingStationCode: c.pollingStationCode || '',
        position: c.position,
        delegateType: c.delegateType,
        status: c.status,
        verificationStatus: c.verificationStatus,
        contestStatus: c.contestStatus,
      }))
      .sort((a, b) => {
        const areaCompare = a.electoralArea.localeCompare(b.electoralArea);
        if (areaCompare !== 0) return areaCompare;
        return a.pollingStationName.localeCompare(b.pollingStationName);
      });

    const header = [
      'Form Number',
      'Full Name',
      'Phone Number',
      'Electoral Area',
      'Polling Station Name',
      'Polling Station Code',
      'Position',
      'Delegate Type',
      'Status',
      'Verification Status',
      'Contest Status',
    ];

    const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((row) =>
        [
          row.formNumber,
          row.fullName,
          row.phoneNumber,
          row.electoralArea,
          row.pollingStationName,
          row.pollingStationCode,
          row.position,
          row.delegateType,
          row.status,
          row.verificationStatus,
          row.contestStatus,
        ]
          .map((value) => csvEscape(String(value ?? '')))
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `vetting-export-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatName = (c: Candidate) => {
    const middle = c.middleName ? ` ${c.middleName}` : '';
    return `${c.surname.toUpperCase()}, ${c.firstName}${middle}`;
  };

  const getBadgeClass = (type: string, value: string) => {
    const map: Record<string, Record<string, string>> = {
      status: { 'IMPORTED': 'issued', 'VETTED': 'pending', 'APPROVED': 'approved', 'REJECTED': 'rejected' },
      verification: { 'VERIFIED': 'verified', 'NOT_VERIFIED': 'not-verified' },
      contest: { 'UNOPPOSED': 'unopposed', 'CONTESTED': 'contested', 'VACANT': 'vacant', 'PENDING': 'pending' },
    };
    return map[type]?.[value] || 'issued';
  };

  const isRowError = (candidate: Candidate) => !candidate.pollingStationCode || !candidate.electoralAreaId;
  const hasDuplicatePhone = (candidate: Candidate) => candidates.filter(c => c.phoneNumber === candidate.phoneNumber).length > 1;

  const allPositions = Array.from(new Set(candidates.map(c => c.position).filter(Boolean)));

  // Vetting questions
  const VETTING_QUESTIONS = [
    { key: 'ASPIRANT_PRESENT', question: 'Aspirant present in person - The aspirant/delegate is physically present' },
    { key: 'MEMBERSHIP_ID_SIGHTED', question: 'Party Membership ID Card sighted - Valid party membership card was presented' },
    { key: 'NAME_MATCHES_REGISTER', question: 'Name matches Party Register - Verified against the official party register' },
    { key: 'NATIONAL_ID_PRESENTED', question: 'National ID (Voters Card or Ghana Card) - Presented valid national identification' },
    { key: 'PHOTO_MATCHES', question: 'Passport photo matches applicant - Photo on form matches the person present' },
    { key: 'MEMBERSHIP_CONFIRMED', question: 'Membership confirmed at station level - Local party officials verified membership' },
  ];

  const toggleVettingResponse = async (questionKey: string, currentResponse: boolean) => {
    if (!selectedCandidate) return;
    setSavingId(questionKey);
    try {
      const res = await fetch(`/api/candidates/${selectedCandidate.id}/vetting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionKey,
          response: !currentResponse,
          verifiedBy: 'Admin',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setVettingQuestions(prev => prev.map(q => q.questionKey === questionKey ? updated : q));
    } catch (err) {
      alert('Failed to update response');
    } finally {
      setSavingId(null);
    }
  };

  const getVettingProgress = () => {
    const answered = vettingQuestions.filter(q => q.response).length;
    return { answered, total: VETTING_QUESTIONS.length, complete: answered === VETTING_QUESTIONS.length };
  };

  const progress = getVettingProgress();
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <div>
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1>Vetting Dashboard</h1>
              <div className="header-subtitle">Review, validate, and manage candidate records</div>
            </div>
            <div className="header-actions">
              <button type="button" className="btn btn-secondary" onClick={goBack}>
                ← Back
              </button>
              <Link href="/" className="btn btn-secondary">← Dashboard</Link>
              <Link href="/edit-candidate" className="btn btn-secondary">Edit candidate</Link>
              <Link href="/import" className="btn btn-secondary">📥 Import</Link>
              <Link href="/reports" className="btn btn-secondary">📋 Reports</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Stats */}
        {stats && (
          <div className="stats-row">
            <div className="stat-card total"><h3>Total</h3><div className="value">{stats.totalCandidates}</div></div>
            <div className="stat-card pending"><h3>Pending</h3><div className="value">{stats.importedCount + stats.vettedCount}</div></div>
            <div className="stat-card approved"><h3>Approved</h3><div className="value">{stats.approvedCount}</div></div>
            <div className="stat-card rejected"><h3>Rejected</h3><div className="value">{stats.rejectedCount}</div></div>
            <div className="stat-card unopposed"><h3>Unopposed</h3><div className="value">{stats.unopposedCount}</div></div>
            <div className="stat-card contested"><h3>Contested</h3><div className="value">{stats.contestedCount}</div></div>
            <div className="stat-card vacant"><h3>Vacant</h3><div className="value">{stats.vacantCount}</div></div>
          </div>
        )}

        {/* Main Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Candidate Management</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-pending">{candidates.length} records</span>
              <button className="btn btn-secondary btn-sm" onClick={exportVettingData} disabled={loading || candidates.length === 0}>
                Export CSV
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="filters">
            <div className="filter-group">
              <input type="text" className="input" placeholder="Search name, phone, form #..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="filter-group">
              <select className="select" value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
                <option value="">All Areas</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <select className="select" value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!filterArea}>
                <option value="">{filterArea ? 'All Stations' : 'Select Area First'}</option>
                {stations.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <select className="select" value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}>
                <option value="">All Positions</option>
                {allPositions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="IMPORTED">Pending</option>
                <option value="VETTED">Vetted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="filter-group">
              <select className="select" value={filterContest} onChange={(e) => setFilterContest(e.target.value)}>
                <option value="">All Contest</option>
                <option value="UNOPPOSED">Unopposed</option>
                <option value="CONTESTED">Contested</option>
                <option value="VACANT">Vacant</option>
              </select>
            </div>
            <div className="filter-group">
              <button className={`btn ${filterHasErrors ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setFilterHasErrors(!filterHasErrors)}>
                {filterHasErrors ? '✓ Errors' : 'Show Errors'}
              </button>
            </div>
          </div>

          {/* Card Grid */}
          {loading ? (
            <div className="loading">Loading candidates...</div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">No candidates found</div>
          ) : (
            <div className="candidate-grid">
              {candidates.map((c) => (
                <div key={c.id} className={`candidate-card ${isRowError(c) ? 'error' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{c.formNumber}</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1.2' }}>{formatName(c)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                      <span className={`badge badge-${getBadgeClass('status', c.status)}`} style={{ fontSize: '0.7rem' }}>{c.status}</span>
                      <span className={`badge badge-${getBadgeClass('contest', c.contestStatus)}`} style={{ fontSize: '0.7rem' }}>
                        {c.contestStatus === 'UNOPPOSED' ? 'Unopposed' : c.contestStatus === 'CONTESTED' ? 'Contested' : c.contestStatus}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Phone</strong>{c.phoneNumber}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Position</strong>{c.position}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Area</strong>{getAreaName(c.electoralAreaId)}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Station</strong>{c.pollingStationCode || 'Not set'}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Verified</strong>
                      <span className={`badge ${c.verificationStatus === 'VERIFIED' ? 'badge-verified' : 'badge-not-verified'}`} style={{ fontSize: '0.7rem' }}>
                        {c.verificationStatus === 'VERIFIED' ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Type</strong>
                      <span className={`badge ${c.delegateType === 'NEW' ? 'badge-issued' : 'badge-pending'}`} style={{ fontSize: '0.7rem' }}>{c.delegateType}</span>
                    </div>
                  </div>

                  {(isRowError(c) || hasDuplicatePhone(c)) && (
                    <div style={{ fontSize: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {isRowError(c) && <div className="warning-item error">⚠ Missing station/area</div>}
                      {hasDuplicatePhone(c) && <div className="warning-item duplicate">⚠ Duplicate phone</div>}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openPanel(c)} style={{ flex: 1 }}>👁 View</button>
                    <Link
                      href={`/edit-candidate?id=${c.id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', textDecoration: 'none' }}
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Candidate Detail Panel */}
      {panelOpen && selectedCandidate && (
        <div className="modal-overlay" onClick={closePanel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Vetting: {selectedCandidate.surname}, {selectedCandidate.firstName}</h2>
              <button className="modal-close" onClick={closePanel}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              {/* Status Overview Section */}
              <div style={{ 
                background: 'linear-gradient(135deg, var(--gray-50), var(--primary-50))',
                padding: '1.5rem',
                borderBottom: '1px solid var(--border-light)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Status</div>
                    <span className={`badge badge-${getBadgeClass('status', selectedCandidate.status)}`} style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
                      {selectedCandidate.status}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Verification</div>
                    <span className={`badge ${selectedCandidate.verificationStatus === 'VERIFIED' ? 'badge-verified' : 'badge-not-verified'}`} style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
                      {selectedCandidate.verificationStatus}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Contest</div>
                    <span className={`badge badge-${getBadgeClass('contest', selectedCandidate.contestStatus)}`} style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
                      {selectedCandidate.contestStatus}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div><strong>Form #:</strong> {selectedCandidate.formNumber}</div>
                  <div><strong>Name:</strong> {formatName(selectedCandidate)}</div>
                  <div><strong>Phone:</strong> {selectedCandidate.phoneNumber}</div>
                  <div><strong>Age:</strong> {selectedCandidate.age || 'Not set'}</div>
                  <div><strong>Electoral Area:</strong> {getAreaName(selectedCandidate.electoralAreaId)}</div>
                  <div><strong>Polling Station:</strong> {selectedCandidate.pollingStationCode || 'Not set'}</div>
                  <div><strong>Position:</strong> {selectedCandidate.position}</div>
                  <div><strong>Delegate Type:</strong> {selectedCandidate.delegateType}</div>
                </div>
              </div>

              {/* Pre-Vetting Observations Section */}
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📋 Pre-Vetting Observations
                </h3>
                {selectedCandidate.comment ? (
                  <div style={{
                    padding: '1rem',
                    background: 'linear-gradient(135deg, var(--warning-50), var(--warning-100))',
                    borderRadius: 'var(--radius)',
                    borderLeft: '4px solid var(--warning)',
                    fontSize: '0.875rem',
                    lineHeight: '1.6'
                  }}>
                    {selectedCandidate.comment}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '1rem', 
                    background: 'var(--gray-50)', 
                    borderRadius: 'var(--radius)',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.875rem'
                  }}>
                    No pre-vetting observations recorded
                  </div>
                )}
              </div>

              {/* Vetting Questions Checklist Section */}
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ✅ Vetting Questions Checklist
                  </h3>
                  <div style={{ 
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    background: progress.complete ? 'var(--success)' : 'var(--warning)',
                    color: 'white'
                  }}>
                    {progress.answered}/{progress.total} Verified
                  </div>
                </div>

                {loadingQuestions ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading questions...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {VETTING_QUESTIONS.map((item) => {
                      const response = vettingQuestions.find(q => q.questionKey === item.key);
                      const isYes = response?.response === true;
                      const isNo = response?.response === false;
                      
                      return (
                        <div
                          key={item.key}
                          style={{
                            padding: '1rem',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            borderLeft: isYes ? '4px solid var(--success)' : isNo ? '4px solid var(--danger)' : '4px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isNo ? '0.5rem' : 0 }}>
                            <div style={{ flex: 1, fontSize: '0.875rem', lineHeight: '1.5' }}>
                              {item.question}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                              <button
                                className={`btn ${isYes ? 'btn-success' : 'btn-secondary'} btn-sm`}
                                onClick={() => toggleVettingResponse(item.key, isYes)}
                                disabled={savingId === item.key}
                                style={{ padding: '0.375rem 0.875rem' }}
                              >
                                ✓ Yes
                              </button>
                              <button
                                className={`btn ${isNo ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                                onClick={() => toggleVettingResponse(item.key, false)}
                                disabled={savingId === item.key || isYes}
                                style={{ padding: '0.375rem 0.875rem' }}
                              >
                                ✕ No
                              </button>
                            </div>
                          </div>
                          {isNo && response?.notes && (
                            <div style={{
                              marginTop: '0.5rem',
                              padding: '0.75rem',
                              background: 'var(--danger-50)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.813rem',
                              color: 'var(--danger)',
                              borderLeft: '3px solid var(--danger)'
                            }}>
                              <strong>Notes:</strong> {response.notes}
                            </div>
                          )}
                          {isNo && !response?.notes && (
                            <div style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--warning)', 
                              marginTop: '0.5rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              ⚠ Please add notes explaining why this item failed
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Data Correction Section */}
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--gray-50)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ✏️ Data Correction
                </h3>
                {correctionError && <div className="error" style={{ marginBottom: '1rem' }}>{correctionError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Electoral Area</label>
                    <select
                      className="select"
                      value={correctionForm.electoralAreaId}
                      onChange={(e) => handleCorrectionChange('electoralAreaId', e.target.value)}
                    >
                      <option value="">Select area...</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Polling Station</label>
                    <select
                      className="select"
                      value={correctionForm.pollingStationCode}
                      onChange={(e) => handleCorrectionChange('pollingStationCode', e.target.value)}
                      disabled={!correctionForm.electoralAreaId}
                    >
                      <option value="">Select station...</option>
                      {correctionForm.electoralAreaId && stations.map(s => (
                        <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={saveCorrections}
                  disabled={savingCorrection || !correctionForm.electoralAreaId || !correctionForm.pollingStationCode}
                >
                  {savingCorrection ? '⏳ Saving...' : '💾 Save Changes'}
                </button>
              </div>

              {/* Final Actions */}
              <div style={{ padding: '1.5rem', background: 'var(--gray-50)' }}>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={closePanel}>
                    ← Back
                  </button>
                  {selectedCandidate.verificationStatus !== 'VERIFIED' && (
                    <button
                      className="btn btn-success"
                      onClick={() => handleAction(selectedCandidate.id, 'verify')}
                      disabled={savingId === selectedCandidate.id || !selectedCandidate.pollingStationCode}
                    >
                      ✓ Verify Candidate
                    </button>
                  )}
                  {selectedCandidate.verificationStatus === 'VERIFIED' && selectedCandidate.status !== 'APPROVED' && selectedCandidate.status !== 'REJECTED' && (
                    <>
                      <button className="btn btn-success" onClick={() => handleAction(selectedCandidate.id, 'approve')} disabled={savingId === selectedCandidate.id}>
                        ✓ Approve Candidate
                      </button>
                      <button className="btn btn-danger" onClick={() => handleAction(selectedCandidate.id, 'reject')} disabled={savingId === selectedCandidate.id}>
                        ✕ Reject Candidate
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDeleteCandidate(selectedCandidate.id)}
                    disabled={savingId === selectedCandidate.id}
                  >
                    🗑 Delete Candidate
                  </button>
                  <button className="btn btn-secondary" onClick={closePanel}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
