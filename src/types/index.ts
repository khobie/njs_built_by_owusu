export interface ElectoralArea {
  id: string;
  name: string;
  code: string;
}

export interface PollingStation {
  name: string;
  code: string;
  electoralAreaId: string;
}

export interface CandidateReport {
  id: string;
  candidateId: string;
  authorName: string;
  reportType: 'GENERAL' | 'RECOMMENDATION' | 'CONCERN' | 'RED_FLAG';
  content: string;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VettingQuestion {
  id: string;
  candidateId: string;
  questionKey: string;
  question: string;
  response: boolean;
  notes: string | null;
  verifiedBy: string;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
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
  createdAt: string;
  updatedAt: string;
  electoralArea?: ElectoralArea;
  pollingStation?: PollingStation;
  reports?: CandidateReport[];
}

export interface CandidateStats {
  totalCandidates: number;
  totalElectoralAreas: number;
  totalPollingStations: number;
  importedCount: number;
  vettedCount: number;
  newCount: number;
  oldCount: number;
  totalReports: number;
  unresolvedReports: number;
  verifiedCount: number;
  unverifiedCount: number;
  approvedCount: number;
  rejectedCount: number;
  errorCount: number;
  // Slot-level metrics (polling_station_code + position)
  unopposedSlots: number;
  contestedSlots: number;
  vacantSlots: number;
  // Backward-compatible aliases
  unopposedCount: number;
  contestedCount: number;
  vacantCount: number;
  byElectoralArea: {
    areaName: string;
    count: number;
  }[];
}

export interface CreateCandidateInput {
  formNumber: string;
  surname: string;
  firstName: string;
  middleName?: string;
  phoneNumber: string;
  age?: number;
  electoralAreaId: string;
  pollingStationCode: string;
  position: string;
  delegateType: string;
  comment?: string;
}

