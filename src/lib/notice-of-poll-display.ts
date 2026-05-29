/**
 * Client-safe types and label helpers for the Notice of Poll portal.
 * No server-only imports (safe to use in client components).
 */

/** Comment auto-stamped on applicants who never appeared for vetting. */
export const NON_ATTENDEE_REASON = 'Did not appear for vetting.';

export type NoticeOfPollFilters = {
  areaIds?: string[];
  position?: string;
  /** CONTESTED | UNOPPOSED (applies to approved applicants only) */
  contestStatus?: string;
  /** Exact Candidate.status match */
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
  phoneNumber: string;
  electoralAreaId: string;
  electoralAreaName: string;
  electoralAreaCode: string;
  position: string;
  positionCanonical: string | null;
  /** VERIFIED | NOT_VERIFIED */
  vettingStatus: string;
  /** Candidate.status (APPROVED / REJECTED / ISSUED / …) */
  approvalStatus: string;
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

export function deriveFinalEligibility(
  status: string,
  contest: RowContestStatus
): FinalEligibility {
  if (status === 'REJECTED') return 'DISQUALIFIED';
  if (status === 'APPROVED') {
    if (contest === 'CONTESTED') return 'ON_BALLOT';
    if (contest === 'UNOPPOSED') return 'ELECTED_UNOPPOSED';
    return 'CLEARED';
  }
  return 'PENDING';
}
