/** Shared UI helpers for post-vetting candidate / delegate display. */

export type VettingOutcome = 'approved' | 'rejected' | null;

export function nominationVettingOutcome(status: string): VettingOutcome {
  if (status === 'APPROVED') return 'approved';
  if (status === 'REJECTED') return 'rejected';
  return null;
}

export function eaPortalVettingOutcome(status: string): VettingOutcome {
  const s = status === 'PENDING' ? 'PENDING_VETTING' : status;
  if (s === 'VERIFIED') return 'approved';
  if (s === 'REJECTED') return 'rejected';
  return null;
}

export function nominationVettingOutcomeLabel(status: string): string | null {
  const o = nominationVettingOutcome(status);
  if (o === 'approved') return 'Approved';
  if (o === 'rejected') return 'Rejected';
  return null;
}

export function eaPortalVettingOutcomeLabel(status: string): string | null {
  const o = eaPortalVettingOutcome(status);
  if (o === 'approved') return 'Approved';
  if (o === 'rejected') return 'Rejected';
  return null;
}

export function nominationCandidateCardClass(status: string, extra?: string): string {
  const parts = ['candidate-card'];
  if (extra) parts.push(extra);
  const o = nominationVettingOutcome(status);
  if (o) {
    parts.push('vetting-decided', `vetting-decided-${o}`);
  }
  return parts.join(' ');
}

export function eaPortalTableRowClass(status: string): string {
  const o = eaPortalVettingOutcome(status);
  if (!o) return '';
  return `ea-row-vetting-decided ea-row-vetting-${o}`;
}
