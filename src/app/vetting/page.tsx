'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/dashboard/AppShell';
import { notifyDashboardRefresh } from '@/lib/dashboard-refresh';
import { canVet, hasSystemWideAccess } from '@/lib/roles';

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

function VettingPageInner() {
  const router = useRouter();
  const routeSearchParams = useSearchParams();
  const activeTab = routeSearchParams.get('tab') === 'search' ? 'search' : 'browse';
  const [showSystemNav, setShowSystemNav] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [allStations, setAllStations] = useState<PollingStation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // Filters
  const [filterArea, setFilterArea] = useState('');
  const [appliedFilterArea, setAppliedFilterArea] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const [appliedFilterStation, setAppliedFilterStation] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [appliedFilterPosition, setAppliedFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [appliedFilterStatus, setAppliedFilterStatus] = useState('');
  const [filterContest, setFilterContest] = useState('');
  const [appliedFilterContest, setAppliedFilterContest] = useState('');
  const [filterHasErrors, setFilterHasErrors] = useState(false);
  const [appliedFilterHasErrors, setAppliedFilterHasErrors] = useState(false);

  // Quick search (Search tab)
  const [quickSearch, setQuickSearch] = useState('');
  const [debouncedQuickSearch, setDebouncedQuickSearch] = useState('');
  const [quickResults, setQuickResults] = useState<Candidate[]>([]);
  const [quickSearching, setQuickSearching] = useState(false);
  
  // Detail panel
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ electoralAreaId: '', pollingStationCode: '' });
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  
  // Edit form
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editStations, setEditStations] = useState<PollingStation[]>([]);

  // Vetting questions
  const [vettingQuestions, setVettingQuestions] = useState<VettingQuestionResponse[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    void fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const data = await res.json();
        const role = data?.user?.role as string | undefined;
        if (!canVet(role)) {
          router.replace('/');
          return;
        }
        setShowSystemNav(hasSystemWideAccess(role ?? ''));
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuickSearch(quickSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [quickSearch]);

  useEffect(() => {
    if (activeTab !== 'search') return;
    if (debouncedQuickSearch.length < 2) {
      setQuickResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setQuickSearching(true);
      try {
        const params = new URLSearchParams({ search: debouncedQuickSearch });
        const res = await fetch(`/api/candidates?${params}`);
        if (!res.ok) throw new Error('Failed');
        const data: Candidate[] = await res.json();
        if (!cancelled) setQuickResults(data);
      } catch {
        if (!cancelled) setQuickResults([]);
      } finally {
        if (!cancelled) setQuickSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, debouncedQuickSearch]);

  const fetchCandidates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (appliedSearch) params.set('search', appliedSearch);
      if (appliedFilterArea) params.set('areaId', appliedFilterArea);
      if (appliedFilterStation) params.set('stationCode', appliedFilterStation);
      if (appliedFilterPosition) params.set('position', appliedFilterPosition);
      if (appliedFilterStatus) params.set('status', appliedFilterStatus);
      if (appliedFilterContest) params.set('contestStatus', appliedFilterContest);
      if (appliedFilterHasErrors) params.set('hasErrors', 'true');
      
      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCandidates(data);
    } catch (err) { console.error('Error:', err); }
  }, [appliedSearch, appliedFilterArea, appliedFilterStation, appliedFilterPosition, appliedFilterStatus, appliedFilterContest, appliedFilterHasErrors]);

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

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  useEffect(() => {
    if (filterArea) { fetchStations(filterArea); setFilterStation(''); } else { setStations([]); setFilterStation(''); }
  }, [filterArea, fetchStations]);

  const openPanel = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setPanelOpen(true);
    setCorrectionForm({ electoralAreaId: candidate.electoralAreaId, pollingStationCode: candidate.pollingStationCode || '' });
    setRejectReason('');
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
      if (action === 'reject' && !rejectReason.trim()) {
        alert('Please provide a rejection reason before rejecting.');
        return;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ reason: rejectReason.trim() }) : undefined,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || `Failed`);
        return;
      }
      const updated = await res.json();
      await Promise.all([fetchCandidates(), fetchStats()]);
      notifyDashboardRefresh();
      if (selectedCandidate?.id === id) {
        setSelectedCandidate(updated);
        if (action === 'reject') setRejectReason('');
      }
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

  const formatName = (c: Candidate) => {
    const middle = c.middleName ? ` ${c.middleName}` : '';
    return `${c.surname.toUpperCase()}, ${c.firstName}${middle}`;
  };

  const getAreaName = (id: string) => areas.find(a => a.id === id)?.name || id;
  const getStationName = (code: string | null) => { if (!code) return 'Not set'; return allStations.find(s => s.code === code)?.name || code; };

  /** When browse + electoral area applied + "All stations", export one CSV with a section per polling station. */
  const splitVettingExportByStation =
    activeTab === 'browse' && Boolean(appliedFilterArea) && !appliedFilterStation;
  const stationsInAppliedArea = splitVettingExportByStation
    ? allStations.filter((s) => s.electoralAreaId === appliedFilterArea)
    : [];
  const canExportVettingCsv =
    !loading &&
    ((splitVettingExportByStation && stationsInAppliedArea.length > 0) ||
      (!splitVettingExportByStation && candidates.length > 0));

  const exportVettingData = () => {
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

    const csvEscape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

    type RowObj = {
      formNumber: string;
      fullName: string;
      phoneNumber: string;
      electoralArea: string;
      pollingStationName: string;
      pollingStationCode: string;
      position: string;
      delegateType: string;
      status: string;
      verificationStatus: string;
      contestStatus: string;
    };

    const rowsFromCandidates = (list: Candidate[]): RowObj[] =>
      list
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

    const linesForRows = (rows: RowObj[]): string[] => [
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

    /** One full-width label row (column A) + empty cells — groups stations on a single sheet. */
    const sectionBannerRow = (label: string) =>
      [csvEscape(label), ...Array(header.length - 1).fill('')].join(',');

    const downloadLines = (lines: string[], filename: string) => {
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const sanitizeFilePart = (s: string) =>
      s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72) || 'export';

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (splitVettingExportByStation && stationsInAppliedArea.length > 0) {
      const areaSlug = sanitizeFilePart(getAreaName(appliedFilterArea));
      const stationsOrdered = [...stationsInAppliedArea].sort(
        (a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
      );
      const out: string[] = [];
      out.push(sectionBannerRow(`Electoral area: ${getAreaName(appliedFilterArea)}`));
      out.push('');

      const codes = new Set(stationsOrdered.map((s) => s.code));

      for (const station of stationsOrdered) {
        const subset = candidates.filter((c) => (c.pollingStationCode || '') === station.code);
        const body = linesForRows(rowsFromCandidates(subset));
        out.push(sectionBannerRow(`Polling station: ${station.name} — code ${station.code}`));
        out.push(...body);
        out.push('');
      }

      const other = candidates.filter(
        (c) =>
          c.electoralAreaId === appliedFilterArea &&
          (!c.pollingStationCode || !codes.has(c.pollingStationCode)),
      );
      if (other.length > 0) {
        const body = linesForRows(rowsFromCandidates(other));
        out.push(sectionBannerRow('Other / unassigned polling station (in this area)'));
        out.push(...body);
        out.push('');
      }

      downloadLines(out, `vetting-${areaSlug}-by-polling-station-${stamp}.csv`);
      return;
    }

    const lines = linesForRows(rowsFromCandidates(candidates));
    downloadLines(lines, `vetting-export-${stamp}.csv`);
  };

  const getBadgeClass = (type: string, value: string) => {
    const map: Record<string, Record<string, string>> = {
      status: { 'IMPORTED': 'issued', 'VETTED': 'pending', 'APPROVED': 'approved', 'REJECTED': 'rejected' },
      verification: { 'VERIFIED': 'verified', 'NOT_VERIFIED': 'not-verified' },
      contest: { 'UNOPPOSED': 'unopposed', 'CONTESTED': 'contested', 'VACANT': 'vacant', 'PENDING': 'pending' },
    };
    return map[type]?.[value] || 'issued';
  };

  const allPositions = Array.from(new Set(candidates.map(c => c.position).filter(Boolean)));

  const rowsForDuplicates = activeTab === 'search' ? quickResults : candidates;
  const isRowError = (candidate: Candidate) => !candidate.pollingStationCode || !candidate.electoralAreaId;
  const hasDuplicatePhone = (candidate: Candidate) =>
    rowsForDuplicates.filter((c) => c.phoneNumber === candidate.phoneNumber).length > 1;

  const openBrowseTab = () => {
    router.replace('/vetting');
  };

  const openSearchTab = () => {
    router.replace('/vetting?tab=search');
  };

  const editCandidateHref = (id: string) => {
    const q = new URLSearchParams({ id, from: 'vetting' });
    if (activeTab === 'search') q.set('vettingTab', 'search');
    return `/edit-candidate?${q.toString()}`;
  };

  // Vetting questions
  const VETTING_QUESTIONS = [
    { key: 'ASPIRANT_PRESENT', question: 'Aspirant present in person - The aspirant/delegate is physically present' },
    { key: 'MEMBERSHIP_ID_SIGHTED', question: 'Party Membership ID Card sighted - Valid party membership card was presented' },
    { key: 'NAME_MATCHES_REGISTER', question: 'Name matches Party Register - Verified against the official party register' },
    { key: 'NATIONAL_ID_PRESENTED', question: 'National ID (Voters Card or Ghana Card) - Presented valid national identification' },
    { key: 'PHOTO_MATCHES', question: 'Passport photo matches applicant - Photo on form matches the person present' },
    { key: 'MEMBERSHIP_CONFIRMED', question: 'Membership confirmed at station level - Local party officials verified membership' },
  ];

  const setVettingResponse = async (questionKey: string, nextResponse: boolean) => {
    if (!selectedCandidate) return;
    setSavingId(questionKey);
    try {
      const res = await fetch(`/api/candidates/${selectedCandidate.id}/vetting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionKey,
          response: nextResponse,
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
  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setAppliedFilterArea(filterArea);
    setAppliedFilterStation(filterStation);
    setAppliedFilterPosition(filterPosition);
    setAppliedFilterStatus(filterStatus);
    setAppliedFilterContest(filterContest);
    setAppliedFilterHasErrors(filterHasErrors);
  };

  const clearFilters = () => {
    setSearch('');
    setFilterArea('');
    setFilterStation('');
    setFilterPosition('');
    setFilterStatus('');
    setFilterContest('');
    setFilterHasErrors(false);

    setAppliedSearch('');
    setAppliedFilterArea('');
    setAppliedFilterStation('');
    setAppliedFilterPosition('');
    setAppliedFilterStatus('');
    setAppliedFilterContest('');
    setAppliedFilterHasErrors(false);
  };

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <AppShell activeHref="/vetting">
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
              {showSystemNav ? (
                <>
                  <Link href="/edit-candidate" className="btn btn-secondary">Edit candidate</Link>
                  <Link href="/import" className="btn btn-secondary">📥 Import</Link>
                  <Link href="/reports" className="btn btn-secondary">📋 Reports</Link>
                </>
              ) : null}
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

        <div
          role="tablist"
          aria-label="Vetting portal sections"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.25rem',
            padding: '0.35rem',
            background: 'var(--gray-50)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'browse'}
            className={`btn btn-sm ${activeTab === 'browse' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={openBrowseTab}
          >
            Browse & filters
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'search'}
            className={`btn btn-sm ${activeTab === 'search' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={openSearchTab}
          >
            Search
          </button>
        </div>

        {activeTab === 'browse' ? (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Candidate Management</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-pending">{candidates.length} records</span>
              <button className="btn btn-secondary btn-sm" onClick={exportVettingData} disabled={!canExportVettingCsv}>
                Export CSV
              </button>
            </div>
            {splitVettingExportByStation && stationsInAppliedArea.length > 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>
                With an electoral area selected and station left as &quot;All Stations&quot;, one spreadsheet file is
                downloaded with a labeled block per polling station (name and code), then column headers and rows for
                that station.
              </p>
            ) : null}
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
            <div className="filter-group">
              <button className="btn btn-primary" onClick={applyFilters}>
                Apply Filters
              </button>
            </div>
            <div className="filter-group">
              <button className="btn btn-secondary" onClick={clearFilters}>
                Clear Filters
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
                      href={editCandidateHref(c.id)}
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
        ) : (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Search candidates</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-pending">{debouncedQuickSearch.length >= 2 ? quickResults.length : 0} matches</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={openBrowseTab}>
                Advanced filters
              </button>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            Type at least two characters. Results update as you type (name, phone, or form number).
          </p>
          <div className="filter-group" style={{ maxWidth: '100%', marginBottom: '1rem' }}>
            <label htmlFor="vetting-quick-search">Search</label>
            <input
              id="vetting-quick-search"
              type="search"
              className="input"
              placeholder="Surname, first name, form number, or phone…"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          {quickSearching && <div className="loading" style={{ padding: '1rem' }}>Searching…</div>}
          {!quickSearching && debouncedQuickSearch.length >= 2 && quickResults.length === 0 && (
            <div className="empty-state">No candidates match this search.</div>
          )}
          {!quickSearching && debouncedQuickSearch.length > 0 && debouncedQuickSearch.length < 2 && (
            <p style={{ color: 'var(--text-tertiary)' }}>Enter at least two characters to search.</p>
          )}
          {!quickSearching && debouncedQuickSearch.length >= 2 && quickResults.length > 0 && (
            <div className="candidate-grid">
              {quickResults.map((c) => (
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
                      href={editCandidateHref(c.id)}
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
        )}
      </main>

      {/* Candidate Detail Panel */}
      {panelOpen && selectedCandidate && (
        <div className="modal-overlay">
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
                                onClick={() => setVettingResponse(item.key, true)}
                                disabled={savingId === item.key}
                                style={{ padding: '0.375rem 0.875rem' }}
                              >
                                ✓ Yes
                              </button>
                              <button
                                className={`btn ${isNo ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                                onClick={() => setVettingResponse(item.key, false)}
                                disabled={savingId === item.key}
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
                {selectedCandidate.verificationStatus === 'VERIFIED' && selectedCandidate.status !== 'APPROVED' && selectedCandidate.status !== 'REJECTED' && (
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Rejection reason (required for reject)
                    </label>
                    <textarea
                      className="input"
                      rows={3}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Enter reason for rejecting this candidate..."
                    />
                  </div>
                )}
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
                  {showSystemNav ? (
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeleteCandidate(selectedCandidate.id)}
                      disabled={savingId === selectedCandidate.id}
                    >
                      🗑 Delete Candidate
                    </button>
                  ) : null}
                  <button className="btn btn-secondary" onClick={closePanel}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppShell>
  );
}

export default function VettingPage() {
  return (
    <Suspense
      fallback={
        <AppShell activeHref="/vetting">
          <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>
            <div className="loading">Loading vetting…</div>
          </div>
        </AppShell>
      }
    >
      <VettingPageInner />
    </Suspense>
  );
}
