'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ElectoralArea {
  id: string;
  name: string;
  code: string;
}

interface PollingStation {
  name: string;
  code: string;
  electoralAreaId: string;
}

interface CandidateReport {
  id: string;
  candidateId: string;
  authorName: string;
  reportType: 'GENERAL' | 'RECOMMENDATION' | 'CONCERN' | 'RED_FLAG' | 'WARNING';
  content: string;
  createdAt: string;
}

interface VettingQuestionResponse {
  id: string;
  candidateId: string;
  questionKey: string;
  question: string;
  response: boolean;
  notes: string | null;
  verifiedBy: string;
}

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

interface Stats {
  totalCandidates: number;
  importedCount: number;
  vettedCount: number;
  approvedCount: number;
  rejectedCount: number;
  unopposedCount: number;
  contestedCount: number;
  vacantCount: number;
  byElectoralArea: { areaName: string; count: number }[];
}

export default function VettingPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [allStations, setAllStations] = useState<PollingStation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [filterArea, setFilterArea] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterContest, setFilterContest] = useState('');
  const [filterHasErrors, setFilterHasErrors] = useState(false);
  
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // Correction form
  const [correctionForm, setCorrectionForm] = useState({
    electoralAreaId: '',
    pollingStationCode: '',
  });
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  
  // Edit form for inline editing
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editStations, setEditStations] = useState<PollingStation[]>([]);
  
  const [positions, setPositions] = useState<string[]>([]);

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
      data.forEach((c: Candidate) => {
        if (c.position) posSet.add(c.position);
      });
      setPositions(Array.from(posSet).sort());
    } catch (err) {
      console.error('Error:', err);
    }
  }, [search, filterArea, filterStation, filterPosition, filterStatus, filterContest, filterHasErrors]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/candidates/stats');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Error:', err);
    }
  }, []);

  const fetchAreas = useCallback(async () => {
    try {
      const res = await fetch('/api/electoral-areas');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setAreas(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchAllStations = useCallback(async () => {
    try {
      const res = await fetch('/api/polling-stations');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setAllStations(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchStations = useCallback(async (areaId: string) => {
    try {
      const res = await fetch(`/api/polling-stations?areaId=${areaId}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStations(data);
    } catch (err) {
      console.error(err);
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

  useEffect(() => {
    fetchCandidates();
  }, [search, filterArea, filterStation, filterPosition, filterStatus, filterContest, filterHasErrors, fetchCandidates]);

  useEffect(() => {
    if (filterArea) {
      fetchStations(filterArea);
      setFilterStation('');
    } else {
      setStations([]);
      setFilterStation('');
    }
  }, [filterArea, fetchStations]);

  const startEdit = (candidate: Candidate) => {
    setEditingId(candidate.id);
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
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditStations([]);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'electoralAreaId') {
      fetchStations(value);
      setEditForm((prev) => ({ ...prev, pollingStationCode: '' }));
    }
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      const payload: Record<string, unknown> = { ...editForm };
      if (editForm.age) payload.age = parseInt(editForm.age, 10);

      const res = await fetch(`/api/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed');

      setEditingId(null);
      setEditForm({});
      await Promise.all([fetchCandidates(), fetchStats()]);
    } catch (err) {
      alert('Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const handleAction = async (id: string, action: 'verify' | 'approve' | 'reject') => {
    setSavingId(id);
    try {
      let endpoint = '';
      if (action === 'verify') endpoint = `/api/candidates/${id}/verify`;
      else if (action === 'approve') endpoint = `/api/candidates/${id}/approve`;
      else endpoint = `/api/candidates/${id}/reject`;

      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || `Failed to ${action}`);
        return;
      }

      await Promise.all([fetchCandidates(), fetchStats()]);
      if (selectedCandidate?.id === id) {
        setSelectedCandidate(null);
        setPanelOpen(false);
      }
    } catch (err) {
      alert(`Error during ${action}`);
    } finally {
      setSavingId(null);
    }
  };

  const openDetailPanel = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setPanelOpen(true);
    setCorrectionForm({
      electoralAreaId: candidate.electoralAreaId,
      pollingStationCode: candidate.pollingStationCode || '',
    });
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelectedCandidate(null);
    setCorrectionError('');
  };

  const handleCorrectionChange = (field: string, value: string) => {
    setCorrectionForm(prev => ({ ...prev, [field]: value }));
    if (field === 'electoralAreaId') {
      setCorrectionForm(prev => ({ ...prev, pollingStationCode: '' }));
    }
  };

  const saveCorrections = async () => {
    if (!selectedCandidate) return;
    setSavingCorrection(true);
    setCorrectionError('');

    try {
      const payload: Record<string, unknown> = {
        electoralAreaId: correctionForm.electoralAreaId,
        pollingStationCode: correctionForm.pollingStationCode || null,
      };

      const res = await fetch(`/api/candidates/${selectedCandidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }

      const updated = await res.json();
      setSelectedCandidate(prev => prev ? { ...prev, ...updated } : null);
      await Promise.all([fetchCandidates(), fetchStats()]);
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'Error saving');
    } finally {
      setSavingCorrection(false);
    }
  };

  const getStationName = (code: string | null) => {
    if (!code) return '-';
    return allStations.find((s) => s.code === code)?.name || code;
  };

  const getAreaName = (id: string) => {
    return areas.find((a) => a.id === id)?.name || id;
  };

  const formatName = (c: Candidate) => {
    const middle = c.middleName ? ` ${c.middleName}` : '';
    return `${c.surname.toUpperCase()}, ${c.firstName}${middle}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      'IMPORTED': 'issued',
      'VETTED': 'pending',
      'APPROVED': 'approved',
      'REJECTED': 'rejected',
    };
    return variants[status] || 'issued';
  };

  const getContestBadge = (status: string) => {
    const variants: Record<string, string> = {
      'UNOPPOSED': 'unopposed',
      'CONTESTED': 'contested',
      'VACANT': 'vacant',
    };
    return variants[status] || 'pending';
  };

  const isRowError = (candidate: Candidate) => {
    return !candidate.pollingStationCode || !candidate.electoralAreaId;
  };

  const hasDuplicatePhone = (candidate: Candidate) => {
    return candidates.filter(c => c.phoneNumber === candidate.phoneNumber).length > 1;
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
              <Link href="/" className="btn btn-secondary">
                ← Dashboard
              </Link>
              <Link href="/import" className="btn btn-secondary">
                📥 Import
              </Link>
              <Link href="/reports" className="btn btn-secondary">
                📋 Reports
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Stats Grid */}
        {stats && (
          <div className="stats-row">
            <div className="stat-card primary">
              <h3>Total</h3>
              <div className="value">{stats.totalCandidates}</div>
            </div>
            <div className="stat-card">
              <h3>Pending</h3>
              <div className="value">{stats.importedCount + stats.vettedCount}</div>
            </div>
            <div className="stat-card success">
              <h3>Approved</h3>
              <div className="value">{stats.approvedCount}</div>
            </div>
            <div className="stat-card danger">
              <h3>Rejected</h3>
              <div className="value">{stats.rejectedCount}</div>
            </div>
            <div className="stat-card unopposed">
              <h3>Unopposed</h3>
              <div className="value">{stats.unopposedCount}</div>
            </div>
            <div className="stat-card contested">
              <h3>Contested</h3>
              <div className="value">{stats.contestedCount}</div>
            </div>
            <div className="stat-card vacant">
              <h3>Vacant</h3>
              <div className="value">{stats.vacantCount}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Candidate Management</h2>
            <span className="badge badge-pending">{candidates.length} records</span>
          </div>

          <div className="filters">
            <div className="filter-group">
              <input
                type="text"
                className="input"
                placeholder="Search name, phone, form #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <select
                className="select"
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
              >
                <option value="">All Areas</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select
                className="select"
                value={filterStation}
                onChange={(e) => setFilterStation(e.target.value)}
                disabled={!filterArea}
              >
                <option value="">{filterArea ? 'All Stations' : 'Select Area First'}</option>
                {stations.map((station) => (
                  <option key={station.code} value={station.code}>
                    {station.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select
                className="select"
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
              >
                <option value="">All Positions</option>
                {positions.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select
                className="select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="IMPORTED">Pending</option>
                <option value="VETTED">Vetted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div className="filter-group">
              <select
                className="select"
                value={filterContest}
                onChange={(e) => setFilterContest(e.target.value)}
              >
                <option value="">All Contest</option>
                <option value="UNOPPOSED">Unopposed</option>
                <option value="CONTESTED">Contested</option>
                <option value="VACANT">Vacant</option>
              </select>
            </div>

            <div className="filter-group">
              <button
                className={`btn ${filterHasErrors ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => setFilterHasErrors(!filterHasErrors)}
                style={{ alignSelf: 'flex-end' }}
              >
                {filterHasErrors ? '✓ Errors' : 'Show Errors'}
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="loading">Loading...</div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">No candidates found</div>
          ) : (
            <div className="table-container">
              <table>
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
                    <th>Verified</th>
                    <th>Contest</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className={`${editingId === c.id ? 'editing-row' : ''} ${isRowError(c) ? 'error-row' : ''}`}
                    >
                      {editingId === c.id ? (
                        <>
                          <td>
                            <input
                              className="input"
                              value={editForm.formNumber || ''}
                              onChange={(e) => handleEditChange('formNumber', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              placeholder="Surname"
                              value={editForm.surname || ''}
                              onChange={(e) => handleEditChange('surname', e.target.value)}
                              style={{ marginBottom: '0.25rem' }}
                            />
                            <input
                              className="input"
                              placeholder="First name"
                              value={editForm.firstName || ''}
                              onChange={(e) => handleEditChange('firstName', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              value={editForm.phoneNumber || ''}
                              onChange={(e) => handleEditChange('phoneNumber', e.target.value)}
                            />
                          </td>
                          <td>
                            <select
                              className="select"
                              value={editForm.electoralAreaId || ''}
                              onChange={(e) => handleEditChange('electoralAreaId', e.target.value)}
                            >
                              <option value="">Select area...</option>
                              {areas.map((area) => (
                                <option key={area.id} value={area.id}>{area.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="select"
                              value={editForm.pollingStationCode || ''}
                              onChange={(e) => handleEditChange('pollingStationCode', e.target.value)}
                            >
                              <option value="">Select station...</option>
                              {editStations.map((station) => (
                                <option key={station.code} value={station.code}>
                                  {station.code}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="select"
                              value={editForm.position || ''}
                              onChange={(e) => handleEditChange('position', e.target.value)}
                            >
                              <option value="">Select...</option>
                              <option value="CHAIRMAN">CHAIRMAN</option>
                              <option value="SECRETARY">SECRETARY</option>
                              <option value="ORGANIZER">ORGANIZER</option>
                              <option value="WOMEN ORGANIZER">WOMEN ORGANIZER</option>
                              <option value="YOUTH ORGANIZER">YOUTH ORGANIZER</option>
                              <option value="COMMUNICATION OFFICER">COMMUNICATION OFFICER</option>
                              <option value="ELECTORAL AFFAIRS OFFICER">ELECTORAL AFFAIRS OFFICER</option>
                            </select>
                          </td>
                          <td>
                            <select
                              className="select"
                              value={editForm.delegateType || 'NEW'}
                              onChange={(e) => handleEditChange('delegateType', e.target.value)}
                            >
                              <option value="NEW">NEW</option>
                              <option value="OLD">OLD</option>
                            </select>
                          </td>
                          <td>
                            <span className="badge badge-pending">VETTED</span>
                          </td>
                          <td>
                            <span className="badge badge-not-verified">NOT VERIFIED</span>
                          </td>
                          <td>
                            <span className="badge badge-pending">PENDING</span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(c.id)}>
                                ✓ Save
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                                ✕ Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><strong>{c.formNumber}</strong></td>
                          <td style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: '500' }} onClick={() => openDetailPanel(c)}>
                            {formatName(c)}
                          </td>
                          <td className={hasDuplicatePhone(c) ? 'duplicate-warning' : ''}>
                            {c.phoneNumber}
                          </td>
                          <td>{getAreaName(c.electoralAreaId)}</td>
                          <td className={isRowError(c) ? 'missing-data' : ''}>
                            {c.pollingStationCode ? `${c.pollingStationCode}` : 'Not set'}
                          </td>
                          <td>{c.position}</td>
                          <td>
                            <span className={`badge ${c.delegateType === 'NEW' ? 'badge-issued' : 'badge-pending'}`}>
                              {c.delegateType}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-${getStatusBadge(c.status)}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${c.verificationStatus === 'VERIFIED' ? 'badge-verified' : 'badge-not-verified'}`}>
                              {c.verificationStatus === 'VERIFIED' ? '✓' : '⦿'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-${getContestBadge(c.contestStatus)}`}>
                              {c.contestStatus === 'UNOPPOSED' ? '✓' :
                               c.contestStatus === 'CONTESTED' ? '⚔' :
                               c.contestStatus === 'VACANT' ? '⊘' : '⏳'}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button className="btn btn-primary btn-sm" onClick={() => openDetailPanel(c)}>
                                👁 View
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => startEdit(c)}
                                disabled={editingId !== null}
                              >
                                ✎ Edit
                              </button>
                              {c.verificationStatus !== 'VERIFIED' && (
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleAction(c.id, 'verify')}
                                  disabled={savingId === c.id || !c.pollingStationCode}
                                >
                                  ✓ Verify
                                </button>
                              )}
                              {c.verificationStatus === 'VERIFIED' && c.status !== 'APPROVED' && c.status !== 'REJECTED' && (
                                <>
                                  <button className="btn btn-success btn-sm" onClick={() => handleAction(c.id, 'approve')}>
                                    ✓ Approve
                                  </button>
                                  <button className="btn btn-danger btn-sm" onClick={() => handleAction(c.id, 'reject')}>
                                    ✕ Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Detail Panel */}
      {panelOpen && selectedCandidate && (
        <div className="modal-overlay" onClick={closePanel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Candidate Details</h2>
              <button className="modal-close" onClick={closePanel}>&times;</button>
            </div>
            <div className="modal-body">
              {/* Info Grid */}
              <div className="grid-2">
                <div><strong>Form #:</strong> {selectedCandidate.formNumber}</div>
                <div><strong>Name:</strong> {formatName(selectedCandidate)}</div>
                <div><strong>Phone:</strong> {selectedCandidate.phoneNumber}</div>
                <div><strong>Age:</strong> {selectedCandidate.age || 'Not set'}</div>
                <div><strong>Electoral Area:</strong> {getAreaName(selectedCandidate.electoralAreaId)}</div>
                <div><strong>Polling Station:</strong> {selectedCandidate.pollingStationCode || 'Not set'}</div>
                <div><strong>Position:</strong> {selectedCandidate.position}</div>
                <div><strong>Delegate Type:</strong> {selectedCandidate.delegateType}</div>
                <div><strong>Status:</strong> <span className={`badge badge-${getStatusBadge(selectedCandidate.status)}`}>{selectedCandidate.status}</span></div>
                <div><strong>Verified:</strong> <span className={`badge ${selectedCandidate.verificationStatus === 'VERIFIED' ? 'badge-verified' : 'badge-not-verified'}`}>{selectedCandidate.verificationStatus}</span></div>
                <div><strong>Contest:</strong> <span className={`badge badge-${getContestBadge(selectedCandidate.contestStatus)}`}>{selectedCandidate.contestStatus}</span></div>
              </div>

              {/* Correction Section */}
              <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--text)' }}>
                  Data Correction
                </h3>
                {correctionError && (
                  <div className="error" style={{ marginBottom: '1rem' }}>{correctionError}</div>
                )}
                <div className="grid-2">
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                      Electoral Area
                    </label>
                    <select
                      className="select"
                      value={correctionForm.electoralAreaId}
                      onChange={(e) => handleCorrectionChange('electoralAreaId', e.target.value)}
                    >
                      <option value="">Select area...</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>{area.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                      Polling Station
                    </label>
                    <select
                      className="select"
                      value={correctionForm.pollingStationCode}
                      onChange={(e) => handleCorrectionChange('pollingStationCode', e.target.value)}
                      disabled={!correctionForm.electoralAreaId}
                    >
                      <option value="">Select station...</option>
                      {correctionForm.electoralAreaId && stations.map((station) => (
                        <option key={station.code} value={station.code}>
                          {station.code} - {station.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={saveCorrections}
                  disabled={savingCorrection || !correctionForm.electoralAreaId || !correctionForm.pollingStationCode}
                  style={{ marginTop: '1rem' }}
                >
                  {savingCorrection ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>

              {/* Comments */}
              {selectedCandidate.comment && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Pre-Vetting Notes</h3>
                  <div style={{
                    padding: '1rem',
                    background: 'var(--warning-light)',
                    borderRadius: 'var(--radius)',
                    borderLeft: '4px solid var(--warning)',
                    fontSize: '0.875rem',
                    lineHeight: '1.5'
                  }}>
                    {selectedCandidate.comment}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="form-actions">
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
                    <button
                      className="btn btn-success"
                      onClick={() => handleAction(selectedCandidate.id, 'approve')}
                      disabled={savingId === selectedCandidate.id}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleAction(selectedCandidate.id, 'reject')}
                      disabled={savingId === selectedCandidate.id}
                    >
                      ✕ Reject
                    </button>
                  </>
                )}
                <button className="btn btn-secondary" onClick={closePanel}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
