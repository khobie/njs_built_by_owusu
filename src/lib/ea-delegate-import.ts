import { canonicalizeDelegatePosition } from '@/lib/delegate-positions';
import { EA_PORTAL_FORM_POSITIONS } from '@/lib/ea-portal-form-constants';

const EA_POSITION_SET = new Set<string>(EA_PORTAL_FORM_POSITIONS);

/** Nomination roster uses WOMEN ORGANIZER; EA portal form uses WOMAN ORGANIZER. */
export function mapNominationPositionToEaForm(position: string): string {
  const canon = canonicalizeDelegatePosition(position);
  if (!canon) return position.trim();
  if (canon === 'WOMEN ORGANIZER') return 'WOMAN ORGANIZER';
  if (EA_POSITION_SET.has(canon)) return canon;
  return position.trim();
}

type ReportBit = { content: string; reportType: string; authorName?: string };
type VettingBit = { question: string; notes: string | null; response: boolean };

export function buildImportCommentFromCandidate(data: {
  comment: string | null;
  age: number | null;
  status: string;
  verificationStatus: string;
  contestStatus: string;
  pollingStationName: string | null;
  pollingStationCode: string | null;
  electoralAreaName: string;
  nominationFormNumber: string;
  reports?: ReportBit[];
  vettingQuestions?: VettingBit[];
}): string {
  const lines: string[] = [];

  if (data.comment?.trim()) {
    lines.push(data.comment.trim());
  }

  const meta: string[] = [];
  if (data.age != null) meta.push(`Age: ${data.age}`);
  meta.push(`Nomination status: ${data.status}`);
  meta.push(`Verification: ${data.verificationStatus}`);
  meta.push(`Contest: ${data.contestStatus}`);
  meta.push(`Nomination area: ${data.electoralAreaName}`);
  if (data.pollingStationName) {
    meta.push(`Polling station: ${data.pollingStationName}`);
  } else if (data.pollingStationCode) {
    meta.push(`Polling station code: ${data.pollingStationCode}`);
  }
  if (meta.length) lines.push(meta.join(' · '));

  for (const r of data.reports ?? []) {
    const text = r.content?.trim();
    if (!text) continue;
    const who = r.authorName ? ` (${r.authorName})` : '';
    lines.push(`Report [${r.reportType}]${who}: ${text}`);
  }

  for (const v of data.vettingQuestions ?? []) {
    const notes = v.notes?.trim();
    if (!notes) continue;
    const ans = v.response ? 'Yes' : 'No';
    lines.push(`Vetting — ${v.question} (${ans}): ${notes}`);
  }

  lines.push(`Imported from nomination form #${data.nominationFormNumber}`);

  return lines.join('\n\n').slice(0, 8000);
}

export type EaDelegateImportPayload = {
  id: string;
  nominationFormNumber: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  phone: string;
  delegateType: string;
  position: string;
  eaPosition: string;
  comment: string;
  age: number | null;
  nominationStatus: string;
  verificationStatus: string;
  contestStatus: string;
  pollingStationCode: string | null;
  pollingStationName: string | null;
  electoralAreaName: string;
  electoralAreaCode: string;
  dateNominated: string;
  suggestedFormNumber: string | null;
};

export function mapCandidateRowToImportPayload(c: {
  id: string;
  formNumber: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  phoneNumber: string;
  delegateType: string;
  position: string;
  comment: string | null;
  age: number | null;
  status: string;
  verificationStatus: string;
  contestStatus: string;
  pollingStationCode: string | null;
  createdAt: Date;
  pollingStation: { name: string } | null;
  electoralArea: { name: string; code: string };
  reports?: ReportBit[];
  vettingQuestions?: VettingBit[];
}): EaDelegateImportPayload {
  const eaPosition = mapNominationPositionToEaForm(c.position);
  const suggestedFormNumber = /^[A-Za-z0-9]{1,6}$/.test(c.formNumber) ? c.formNumber : null;

  const comment = buildImportCommentFromCandidate({
    comment: c.comment,
    age: c.age,
    status: c.status,
    verificationStatus: c.verificationStatus,
    contestStatus: c.contestStatus,
    pollingStationName: c.pollingStation?.name ?? null,
    pollingStationCode: c.pollingStationCode,
    electoralAreaName: c.electoralArea.name,
    nominationFormNumber: c.formNumber,
    reports: c.reports,
    vettingQuestions: c.vettingQuestions,
  });

  return {
    id: c.id,
    nominationFormNumber: c.formNumber,
    surname: c.surname,
    firstName: c.firstName,
    middleName: c.middleName,
    phone: c.phoneNumber,
    delegateType: c.delegateType,
    position: c.position,
    eaPosition,
    comment,
    age: c.age,
    nominationStatus: c.status,
    verificationStatus: c.verificationStatus,
    contestStatus: c.contestStatus,
    pollingStationCode: c.pollingStationCode,
    pollingStationName: c.pollingStation?.name ?? null,
    electoralAreaName: c.electoralArea.name,
    electoralAreaCode: c.electoralArea.code,
    dateNominated: c.createdAt.toISOString().slice(0, 10),
    suggestedFormNumber,
  };
}
