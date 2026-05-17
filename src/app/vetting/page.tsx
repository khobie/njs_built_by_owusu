'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/dashboard/AppShell';
import { notifyDashboardRefresh } from '@/lib/dashboard-refresh';
import { canVet, hasSystemWideAccess } from '@/lib/roles';
import {
  CANONICAL_DELEGATE_POSITIONS,
  compareDelegatePositionCsvOrder,
  canonicalizeDelegatePosition,
} from '@/lib/delegate-positions';

interface ElectoralArea { id: string; name: string; code: string; }
interface PollingStation { name: string; code: string; electoralAreaId: string; }
interface PollingStationOption { code: string; name: string; electoralAreaId: string; }

type VettingFocus = 'electoral' | 'polling_station';
interface CandidateReport { id: string; candidateId: string; authorName: string; reportType: string; content: string; isResolved?: boolean; createdAt: string; }
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
interface Stats {
  totalCandidates: number;
  importedCount: number;
  vettedCount: number;
  approvedCount: number;
  rejectedCount: number;
  unopposedCount: number;
  contestedCount: number;
  vacantCount: number;
  errorCount?: number;
  byElectoralArea: { areaName: string; count: number }[];
}

function VettingPageInner() {
  const router = useRouter();
  const routeSearchParams = useSearchParams();
  const activeTab = routeSearchParams.get('tab') === 'search' ? 'search' : 'browse';
  const vettingFocus: VettingFocus =
    routeSearchParams.get('focus') === 'polling' || routeSearchParams.get('focus') === 'station'
      ? 'polling_station'
      : 'electoral';
  const [showSystemNav, setShowSystemNav] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [areas, setAreas] = useState<ElectoralArea[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // Filters
  const [filterArea, setFilterArea] = useState('');
  const [appliedFilterArea, setAppliedFilterArea] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [appliedFilterPosition, setAppliedFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [appliedFilterStatus, setAppliedFilterStatus] = useState('');
  const [filterContest, setFilterContest] = useState('');
  const [appliedFilterContest, setAppliedFilterContest] = useState('');
  const [filterHasErrors, setFilterHasErrors] = useState(false);
  const [appliedFilterHasErrors, setAppliedFilterHasErrors] = useState(false);
  const [filterStation, setFilterStation] = useState('');
  const [appliedFilterStation, setAppliedFilterStation] = useState('');
  const [pollingStations, setPollingStations] = useState<PollingStationOption[]>([]);

  // Quick search (Search tab)
  const [quickSearch, setQuickSearch] = useState('');
  const [debouncedQuickSearch, setDebouncedQuickSearch] = useState('');
  const [quickResults, setQuickResults] = useState<Candidate[]>([]);
  const [quickSearching, setQuickSearching] = useState(false);
  
  // Detail panel
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ electoralAreaId: '' });
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  
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
      if (appliedFilterPosition) params.set('position', appliedFilterPosition);
      if (appliedFilterStatus) params.set('status', appliedFilterStatus);
      if (appliedFilterContest) params.set('contestStatus', appliedFilterContest);
      if (appliedFilterHasErrors) params.set('hasErrors', 'true');
      if (vettingFocus === 'polling_station' && appliedFilterStation) {
        params.set('stationCode', appliedFilterStation);
      }

      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCandidates(data);
    } catch (err) { console.error('Error:', err); }
  }, [
    appliedSearch,
    appliedFilterArea,
    appliedFilterPosition,
    appliedFilterStatus,
    appliedFilterContest,
    appliedFilterHasErrors,
    appliedFilterStation,
    vettingFocus,
  ]);

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

  useEffect(() => {
    if (vettingFocus !== 'polling_station') return;
    let cancelled = false;
    (async () => {
      try {
        const q = filterArea ? `?areaId=${encodeURIComponent(filterArea)}` : '';
        const res = await fetch(`/api/polling-stations${q}`);
        if (!res.ok) throw new Error('Failed');
        const data: PollingStationOption[] = await res.json();
        if (!cancelled) setPollingStations(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPollingStations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vettingFocus, filterArea]);

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
      await Promise.all([fetchCandidates(), fetchAreas(), fetchStats()]);
      setLoading(false);
    }
    init();
  }, [fetchCandidates, fetchAreas, fetchStats]);

  const refreshLists = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchCandidates(), fetchStats()]);
    } finally {
      setLoading(false);
    }
  }, [fetchCandidates, fetchStats]);

  const openPanel = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setPanelOpen(true);
    setCorrectionForm({ electoralAreaId: candidate.electoralAreaId });
    setRejectReason('');
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
        setSavingId(null);
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

  const handleCorrectionChange = (field: string, value: string) => {
    setCorrectionForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveCorrections = async () => {
    if (!selectedCandidate) return;
    setSavingCorrection(true);
    setCorrectionError('');
    try {
      const res = await fetch(`/api/candidates/${selectedCandidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electoralAreaId: correctionForm.electoralAreaId }),
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

  const getAreaName = (id: string) => areas.find((a) => a.id === id)?.name || id;
  const getAreaCode = (id: string) => areas.find((a) => a.id === id)?.code || '';

  const sortedPollingStations = useMemo(() => {
    return [...pollingStations].sort((a, b) => {
      const an = areas.find((x) => x.id === a.electoralAreaId)?.name ?? '';
      const bn = areas.find((x) => x.id === b.electoralAreaId)?.name ?? '';
      if (an !== bn) return an.localeCompare(bn);
      return a.name.localeCompare(b.name);
    });
  }, [pollingStations, areas]);

  useEffect(() => {
    if (vettingFocus !== 'polling_station' || !filterStation) return;
    if (pollingStations.length === 0) return;
    if (!pollingStations.some((s) => s.code === filterStation)) {
      setFilterStation('');
    }
  }, [vettingFocus, filterStation, pollingStations]);

  const formatContestLabel = (s: string) => {
    switch (s) {
      case 'UNOPPOSED':
        return 'Unopposed';
      case 'CONTESTED':
        return 'Contested';
      case 'VACANT':
        return 'Vacant';
      case 'PENDING':
        return 'Pending';
      default:
        return s;
    }
  };

  const positionFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of CANONICAL_DELEGATE_POSITIONS) {
      seen.add(p);
      out.push(p);
    }
    for (const c of candidates) {
      const p = (c.position ?? '').trim();
      if (p && !seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    return out.sort((a, b) => compareDelegatePositionCsvOrder(a, b));
  }, [candidates]);

  const exportVettingData = () => {
    const includeStationColumns = vettingFocus === 'polling_station';
    const header = [
      'Form Number',
      'Full Name',
      'Phone Number',
      'Electoral Area',
      ...(includeStationColumns ? (['Polling Station Name', 'Polling Station Code'] as const) : []),
      'Position',
      'Delegate Type',
      'Status',
      'Verification Status',
      'Contest Status',
      'Red Flag',
      'Rejected',
    ];

    const csvEscape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

    const redFlagLabelForCsv = (c: Candidate): string => {
      const reports = c.reports ?? [];
      const red = reports.filter((r) => r.reportType === 'RED_FLAG');
      if (red.length === 0) return 'NO';
      const unresolved = red.filter((r) => !r.isResolved).length;
      if (unresolved > 0) return `RED FLAG — ${unresolved} unresolved`;
      return 'RED FLAG — all resolved';
    };

    const rejectedLabelForCsv = (c: Candidate): string =>
      c.status === 'REJECTED' ? 'REJECTED' : 'NO';

    /** Human-readable Position cell: vacant vs non-canonical vs normal. */
    const positionLabelForCsv = (raw: string | null | undefined): string => {
      const t = (raw ?? '').trim();
      if (!t) return 'VACANT — position not assigned';
      if (canonicalizeDelegatePosition(t) === null) {
        return `MISSING CANONICAL ROLE — ${t}`;
      }
      return t;
    };

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
      redFlag: string;
      rejected: string;
    };

    const rowsFromCandidates = (list: Candidate[]): RowObj[] =>
      list
        .map((c) => ({
          formNumber: c.formNumber,
          fullName: formatName(c),
          phoneNumber: c.phoneNumber,
          electoralArea: getAreaName(c.electoralAreaId),
          pollingStationName: c.pollingStation?.name || '',
          pollingStationCode: c.pollingStationCode || '',
          position: c.position,
          delegateType: c.delegateType,
          status: c.status,
          verificationStatus: c.verificationStatus,
          contestStatus: c.contestStatus,
          redFlag: redFlagLabelForCsv(c),
          rejected: rejectedLabelForCsv(c),
        }))
        .sort((a, b) => {
          const areaCompare = a.electoralArea.localeCompare(b.electoralArea);
          if (areaCompare !== 0) return areaCompare;
          const posCompare = compareDelegatePositionCsvOrder(a.position, b.position);
          if (posCompare !== 0) return posCompare;
          return a.fullName.localeCompare(b.fullName);
        });

    const linesForRows = (rows: RowObj[]): string[] => [
      header.map(csvEscape).join(','),
      ...rows.map((row) =>
        [
          row.formNumber,
          row.fullName,
          row.phoneNumber,
          row.electoralArea,
          ...(includeStationColumns ? [row.pollingStationName, row.pollingStationCode] : []),
          positionLabelForCsv(row.position),
          row.delegateType,
          row.status,
          row.verificationStatus,
          row.contestStatus,
          row.redFlag,
          row.rejected,
        ]
          .map((value) => csvEscape(String(value ?? '')))
          .join(',')
      ),
    ];

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

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    const lines = linesForRows(rowsFromCandidates(candidates));
    downloadLines(lines, `vetting-export-${stamp}.csv`);
  };

  const getBadgeClass = (type: string, value: string) => {
    const map: Record<string, Record<string, string>> = {
      status: {
        ISSUED: 'issued',
        IMPORTED: 'issued',
        VETTED: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
      },
      verification: { 'VERIFIED': 'verified', 'NOT_VERIFIED': 'not-verified' },
      contest: { 'UNOPPOSED': 'unopposed', 'CONTESTED': 'contested', 'VACANT': 'vacant', 'PENDING': 'pending' },
    };
    return map[type]?.[value] || 'issued';
  };

  const rowsForDuplicates = activeTab === 'search' ? quickResults : candidates;
  const isRowError = (candidate: Candidate) =>
    !candidate.electoralAreaId || canonicalizeDelegatePosition(candidate.position) === null;
  const needsStationInPollingMode = (candidate: Candidate) =>
    vettingFocus === 'polling_station' && !(candidate.pollingStationCode ?? '').trim();
  const hasDuplicatePhone = (candidate: Candidate) =>
    rowsForDuplicates.filter((c) => c.phoneNumber === candidate.phoneNumber).length > 1;

  const setVettingFocusMode = (next: VettingFocus) => {
    if (next === 'electoral') {
      setFilterStation('');
      setAppliedFilterStation('');
    }
    const sp = new URLSearchParams(routeSearchParams.toString());
    if (next === 'polling_station') sp.set('focus', 'polling');
    else sp.delete('focus');
    const qs = sp.toString();
    router.replace(qs ? `/vetting?${qs}` : '/vetting');
  };

  const openBrowseTab = () => {
    const sp = new URLSearchParams(routeSearchParams.toString());
    sp.delete('tab');
    const qs = sp.toString();
    router.replace(qs ? `/vetting?${qs}` : '/vetting');
  };

  const openSearchTab = () => {
    const sp = new URLSearchParams(routeSearchParams.toString());
    sp.set('tab', 'search');
    router.replace(`/vetting?${sp.toString()}`);
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
    {
      key: 'MEMBERSHIP_CONFIRMED',
      question:
        'Membership confirmed at local level — Party officials verified membership for this electoral area / branch',
    },
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
    const yesCount = vettingQuestions.filter((q) => q.response === true).length;
    const total = VETTING_QUESTIONS.length;
    return { answered: yesCount, total, complete: yesCount === total };
  };

  const progress = getVettingProgress();
  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setAppliedFilterArea(filterArea);
    setAppliedFilterPosition(filterPosition);
    setAppliedFilterStatus(filterStatus);
    setAppliedFilterContest(filterContest);
    setAppliedFilterHasErrors(filterHasErrors);
    setAppliedFilterStation(vettingFocus === 'polling_station' ? filterStation : '');
  };

  const clearFilters = () => {
    setSearch('');
    setFilterArea('');
    setFilterPosition('');
    setFilterStatus('');
    setFilterContest('');
    setFilterHasErrors(false);
    setFilterStation('');

    setAppliedSearch('');
    setAppliedFilterArea('');
    setAppliedFilterPosition('');
    setAppliedFilterStatus('');
    setAppliedFilterContest('');
    setAppliedFilterHasErrors(false);
    setAppliedFilterStation('');
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
              <div className="header-subtitle">
                {vettingFocus === 'polling_station' ? (
                  <>
                    You are in <strong>polling-station workflow</strong>: narrow the list by station, vet delegates linked to that site,
                    and still fix area + canonical role when needed. Slots and contest logic remain per electoral area and position.
                  </>
                ) : (
                  <>
                    Review delegates by electoral area and canonical role only. Verification and approval use the area × position
                    slot. Use the toggle below if you need polling-station filtering and legacy station fields.
                  </>
                )}
              </div>
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
                  <Link href="/polling-stations" className="btn btn-secondary">
                    Area slots
                  </Link>
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
            <div className="stat-card vacant"><h3>Vacant slots</h3><div className="value">{stats.vacantCount}</div></div>
            {typeof stats.errorCount === 'number' ? (
              <div className="stat-card pending">
                <h3>Data issues</h3>
                <div className="value">{stats.errorCount}</div>
                <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.85 }}>Non-canonical role</small>
              </div>
            ) : null}
          </div>
        )}

        <div
          className="section"
          style={{
            marginBottom: '1.25rem',
            padding: '1rem 1.25rem',
            background: 'var(--surface-elevated, var(--gray-50))',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>
            Vetting scope
          </div>
          <div
            role="group"
            aria-label="Choose vetting workflow"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'stretch' }}
          >
            <button
              type="button"
              onClick={() => setVettingFocusMode('electoral')}
              className={`btn btn-sm ${vettingFocus === 'electoral' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: '1 1 220px', textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal', lineHeight: 1.35, padding: '0.65rem 0.85rem' }}
            >
              <span style={{ display: 'block', fontWeight: 700 }}>Electoral area &amp; role</span>
              <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.92, fontWeight: 400, marginTop: '0.2rem' }}>
                Default: filter by area and canonical delegate position (seven slots per area).
              </span>
            </button>
            <button
              type="button"
              onClick={() => setVettingFocusMode('polling_station')}
              className={`btn btn-sm ${vettingFocus === 'polling_station' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: '1 1 220px', textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal', lineHeight: 1.35, padding: '0.65rem 0.85rem' }}
            >
              <span style={{ display: 'block', fontWeight: 700 }}>Polling station</span>
              <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.92, fontWeight: 400, marginTop: '0.2rem' }}>
                Optional: filter candidates by linked polling station (legacy / field workflow). URL: <code style={{ fontSize: '0.72rem' }}>?focus=polling</code>
              </span>
            </button>
          </div>
        </div>

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
            <div>
              <h2 className="section-title">Candidate management</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0', maxWidth: '42rem' }}>
                {vettingFocus === 'polling_station' ? (
                  <>
                    Filter by polling station (optionally narrow the station list with an area first), then canonical role and status.
                    Rows without a linked station are flagged in this mode. Contest labels still reflect area + position slots.
                  </>
                ) : (
                  <>
                    Filter by electoral area and canonical role. Use <strong>Show errors</strong> for rows that need a valid role label.
                    Contest labels reflect approved delegates per area slot.
                  </>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
              <span className="badge badge-pending">{candidates.length} records</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refreshLists()} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportVettingData} disabled={loading || candidates.length === 0}>
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
              <select
                className="select"
                value={filterArea}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilterArea(v);
                  if (vettingFocus === 'polling_station') setFilterStation('');
                }}
              >
                <option value="">All Areas</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {vettingFocus === 'polling_station' ? (
              <div className="filter-group">
                <select
                  className="select"
                  value={filterStation}
                  onChange={(e) => setFilterStation(e.target.value)}
                  aria-label="Filter by polling station"
                  title="Filter candidates linked to this polling station code"
                >
                  <option value="">All polling stations</option>
                  {sortedPollingStations.map((s) => (
                    <option key={s.code} value={s.code}>
                      {getAreaName(s.electoralAreaId)} — {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="filter-group">
              <select className="select" value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}>
                <option value="">All Positions</option>
                {positionFilterOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="ISSUED">Issued</option>
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
                <option value="PENDING">Pending / unset</option>
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
                <div
                  key={c.id}
                  className={`candidate-card ${isRowError(c) || needsStationInPollingMode(c) ? 'error' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{c.formNumber}</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1.2' }}>{formatName(c)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                      <span className={`badge badge-${getBadgeClass('status', c.status)}`} style={{ fontSize: '0.7rem' }}>{c.status}</span>
                      <span className={`badge badge-${getBadgeClass('contest', c.contestStatus)}`} style={{ fontSize: '0.7rem' }}>
                        {formatContestLabel(c.contestStatus)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Phone</strong>{c.phoneNumber}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Position</strong>{c.position}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Area</strong>{getAreaName(c.electoralAreaId)}{getAreaCode(c.electoralAreaId) ? ` (${getAreaCode(c.electoralAreaId)})` : ''}</div>
                    {vettingFocus === 'polling_station' && (c.pollingStationCode || c.pollingStation?.name) ? (
                      <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Poll station (opt.)</strong>{c.pollingStation?.name ? `${c.pollingStation.name} · ` : ''}{c.pollingStationCode || '—'}</div>
                    ) : null}
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Verified</strong>
                      <span className={`badge ${c.verificationStatus === 'VERIFIED' ? 'badge-verified' : 'badge-not-verified'}`} style={{ fontSize: '0.7rem' }}>
                        {c.verificationStatus === 'VERIFIED' ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Type</strong>
                      <span className={`badge ${c.delegateType === 'NEW' ? 'badge-issued' : 'badge-pending'}`} style={{ fontSize: '0.7rem' }}>{c.delegateType}</span>
                    </div>
                  </div>

                  {(isRowError(c) || needsStationInPollingMode(c) || hasDuplicatePhone(c)) && (
                    <div style={{ fontSize: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {isRowError(c) && <div className="warning-item error">⚠ Missing electoral area or invalid role</div>}
                      {needsStationInPollingMode(c) && (
                        <div className="warning-item duplicate">⚠ No polling station linked (add in Edit)</div>
                      )}
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
            Type at least two characters. Results update as you type (name, phone, or form number). Open a card for full vetting
            checklist and area + role context.
            {vettingFocus === 'polling_station' ? (
              <span>
                {' '}
                In <strong>polling-station scope</strong>, use Browse &amp; filters to narrow by station; search is still global.
              </span>
            ) : null}
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
                <div
                  key={c.id}
                  className={`candidate-card ${isRowError(c) || needsStationInPollingMode(c) ? 'error' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{c.formNumber}</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1.2' }}>{formatName(c)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                      <span className={`badge badge-${getBadgeClass('status', c.status)}`} style={{ fontSize: '0.7rem' }}>{c.status}</span>
                      <span className={`badge badge-${getBadgeClass('contest', c.contestStatus)}`} style={{ fontSize: '0.7rem' }}>
                        {formatContestLabel(c.contestStatus)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Phone</strong>{c.phoneNumber}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Position</strong>{c.position}</div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Area</strong>{getAreaName(c.electoralAreaId)}{getAreaCode(c.electoralAreaId) ? ` (${getAreaCode(c.electoralAreaId)})` : ''}</div>
                    {vettingFocus === 'polling_station' && (c.pollingStationCode || c.pollingStation?.name) ? (
                      <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Poll station (opt.)</strong>{c.pollingStation?.name ? `${c.pollingStation.name} · ` : ''}{c.pollingStationCode || '—'}</div>
                    ) : null}
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Verified</strong>
                      <span className={`badge ${c.verificationStatus === 'VERIFIED' ? 'badge-verified' : 'badge-not-verified'}`} style={{ fontSize: '0.7rem' }}>
                        {c.verificationStatus === 'VERIFIED' ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div><strong style={{ color: 'var(--text-secondary)', fontWeight: '500', fontSize: '0.75rem', display: 'block' }}>Type</strong>
                      <span className={`badge ${c.delegateType === 'NEW' ? 'badge-issued' : 'badge-pending'}`} style={{ fontSize: '0.7rem' }}>{c.delegateType}</span>
                    </div>
                  </div>

                  {(isRowError(c) || needsStationInPollingMode(c) || hasDuplicatePhone(c)) && (
                    <div style={{ fontSize: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {isRowError(c) && <div className="warning-item error">⚠ Missing electoral area or invalid role</div>}
                      {needsStationInPollingMode(c) && (
                        <div className="warning-item duplicate">⚠ No polling station linked (add in Edit)</div>
                      )}
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
        <div className="modal-overlay" role="presentation" onClick={closePanel}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
                      {formatContestLabel(selectedCandidate.contestStatus)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div><strong>Form #:</strong> {selectedCandidate.formNumber}</div>
                  <div><strong>Name:</strong> {formatName(selectedCandidate)}</div>
                  <div><strong>Phone:</strong> {selectedCandidate.phoneNumber}</div>
                  <div><strong>Age:</strong> {selectedCandidate.age || 'Not set'}</div>
                  <div>
                    <strong>Electoral area:</strong> {getAreaName(selectedCandidate.electoralAreaId)}
                    {getAreaCode(selectedCandidate.electoralAreaId)
                      ? ` (${getAreaCode(selectedCandidate.electoralAreaId)})`
                      : ''}
                  </div>
                  {vettingFocus === 'polling_station' ? (
                    <div>
                      <strong>Poll station (optional):</strong>{' '}
                      {selectedCandidate.pollingStation?.name
                        ? `${selectedCandidate.pollingStation.name} · `
                        : ''}
                      {selectedCandidate.pollingStationCode || '—'}
                      {!selectedCandidate.pollingStationCode?.trim() ? (
                        <span style={{ color: 'var(--warning, #b45309)', fontSize: '0.8rem', display: 'block', marginTop: '0.25rem' }}>
                          Polling-station scope: this row has no station code yet — link one via Edit if you are vetting by station.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <strong>Position:</strong> {selectedCandidate.position}
                    {canonicalizeDelegatePosition(selectedCandidate.position) === null ? (
                      <span style={{ color: 'var(--danger)', fontSize: '0.8rem', display: 'block', marginTop: '0.25rem' }}>
                        Not a canonical role — edit the record before verification.
                      </span>
                    ) : null}
                  </div>
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
                    {progress.answered}/{progress.total} Yes
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
                <div style={{ marginBottom: '1rem' }}>
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
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
                    {vettingFocus === 'polling_station'
                      ? 'Delegates are tracked per electoral area and canonical role. Polling stations are optional legacy metadata.'
                      : 'In electoral-area vetting, only the area and canonical role are used for slots and approval.'}
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={saveCorrections}
                  disabled={savingCorrection || !correctionForm.electoralAreaId}
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
                {selectedCandidate.verificationStatus !== 'VERIFIED' && isRowError(selectedCandidate) && (
                  <p className="error" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                    Assign a valid electoral area and one of the seven canonical roles (use <strong>Edit candidate</strong>) before
                    verification.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={closePanel}>
                    ← Back
                  </button>
                  {selectedCandidate.verificationStatus !== 'VERIFIED' && (
                    <button
                      className="btn btn-success"
                      onClick={() => handleAction(selectedCandidate.id, 'verify')}
                      disabled={
                        savingId === selectedCandidate.id ||
                        !selectedCandidate.electoralAreaId ||
                        isRowError(selectedCandidate)
                      }
                      title={
                        isRowError(selectedCandidate)
                          ? 'Fix area and canonical role before verifying'
                          : undefined
                      }
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
