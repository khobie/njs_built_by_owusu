/**
 * Client-safe types and label helpers for the Notice of Poll portal.
 * Operates on EA Portal form data (EaPortalIssuedForm). No server-only imports.
 *
 * EA status mapping for the notice:
 *   VERIFIED  → approved / cleared to contest
 *   REJECTED  → disqualified
 *   other     → pending (did not complete vetting)
 */

/** Comment auto-stamped on applicants who never appeared for vetting. */
export const NON_ATTENDEE_REASON = 'Did not appear for vetting.';

export type NoticeOfPollFilters = {
  areaIds?: string[];
  position?: string;
  /** CONTESTED | UNOPPOSED (applies to verified/approved applicants only) */
  contestStatus?: string;
  /** Exact EaPortalIssuedForm.status match */
  status?: string;
  approvedOnly?: boolean;
  disqualifiedOnly?: boolean;
  q?: string;
};

export type RowContestStatus = 'CONTESTED' | 'UNOPPOSED' | 'NONE';

export type FinalEligibility =
  | 'ELECTED_UNOPPOSED'
  | 'ON_BALLOT'
  | 'CLEARED'
  | 'DISQUALIFIED'
  | 'PENDING';

export type NoticeOfPollRow = {
  id: string;
  formNumber: string;
  applicantName: string;
  phone: string;
  electoralAreaId: string;
  electoralAreaName: string;
  electoralAreaRegion: string;
  position: string;
  /** Raw EA form status (VERIFIED / REJECTED / ISSUED / RETURNED / PENDING_VETTING) */
  status: string;
  contestStatus: RowContestStatus;
  disqualificationReason: string | null;
  finalEligibility: FinalEligibility;
};

export type NoticeOfPollSummary = {
  totalApplicants: number;
  totalApproved: number;
  totalDisqualified: number;
  contestedPositions: number;
  unopposedPositions: number;
  didNotAppear: number;
};

export type NoticeOfPollPayload = {
  generatedAt: string;
  summary: NoticeOfPollSummary;
  rows: NoticeOfPollRow[];
  filteredCount: number;
};

export function finalEligibilityLabel(value: FinalEligibility): string {
  switch (value) {
    case 'ELECTED_UNOPPOSED':
      return 'Elected unopposed';
    case 'ON_BALLOT':
      return 'On ballot (contested)';
    case 'CLEARED':
      return 'Cleared to contest';
    case 'DISQUALIFIED':
      return 'Disqualified';
    default:
      return 'Pending vetting';
  }
}

export function rowContestStatusLabel(value: RowContestStatus): string {
  if (value === 'CONTESTED') return 'Contested';
  if (value === 'UNOPPOSED') return 'Unopposed';
  return '—';
}

/** High-level approval label derived from the EA form status. */
export function approvalLabel(status: string): string {
  if (status === 'VERIFIED') return 'Approved';
  if (status === 'REJECTED') return 'Disqualified';
  return 'Pending';
}

export function deriveFinalEligibility(
  status: string,
  contest: RowContestStatus
): FinalEligibility {
  if (status === 'REJECTED') return 'DISQUALIFIED';
  if (status === 'VERIFIED') {
    if (contest === 'CONTESTED') return 'ON_BALLOT';
    if (contest === 'UNOPPOSED') return 'ELECTED_UNOPPOSED';
    return 'CLEARED';
  }
  return 'PENDING';
}
