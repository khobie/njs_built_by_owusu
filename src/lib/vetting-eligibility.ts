/** Guards: vetting actions require the nomination / EA form to be returned first. */

export const NOMINATION_FORM_NOT_RETURNED_MESSAGE =
  'This applicant has not returned the nomination form. Vetting is only allowed after the form is returned.';

export const EA_FORM_NOT_RETURNED_MESSAGE =
  'This delegate has not returned the form. Mark as returned before vetting.';

export function nominationFormReturned(status: string): boolean {
  return status.trim().toUpperCase() !== 'ISSUED';
}

export function assertNominationCanVet(
  status: string
): { ok: true } | { ok: false; error: string } {
  if (!nominationFormReturned(status)) {
    return { ok: false, error: NOMINATION_FORM_NOT_RETURNED_MESSAGE };
  }
  return { ok: true };
}

function normalizeEaFormStatus(status: string): string {
  return status === 'PENDING' ? 'PENDING_VETTING' : status;
}

export function eaFormReturned(status: string): boolean {
  return normalizeEaFormStatus(status) !== 'ISSUED';
}

/** Vet API actions that require the form to be returned (not `return`). */
export function eaVetActionRequiresReturn(action: string): boolean {
  return action !== 'return';
}

export function assertEaFormCanVet(
  status: string,
  action?: string
): { ok: true } | { ok: false; error: string } {
  if (action && !eaVetActionRequiresReturn(action)) {
    return { ok: true };
  }
  if (!eaFormReturned(status)) {
    return { ok: false, error: EA_FORM_NOT_RETURNED_MESSAGE };
  }
  return { ok: true };
}

const EA_VETTING_STATUSES = new Set(['PENDING_VETTING', 'VERIFIED', 'REJECTED']);

export function isEaVettingStatus(status: string): boolean {
  return EA_VETTING_STATUSES.has(normalizeEaFormStatus(status));
}

export function assertEaPatchStatusAllowed(
  currentStatus: string,
  nextStatus: string
): { ok: true } | { ok: false; error: string } {
  const cur = normalizeEaFormStatus(currentStatus);
  const next = normalizeEaFormStatus(nextStatus);
  if (cur === 'ISSUED' && isEaVettingStatus(next)) {
    return { ok: false, error: EA_FORM_NOT_RETURNED_MESSAGE };
  }
  return { ok: true };
}

const NOMINATION_VETTING_STATUSES = new Set(['VETTED', 'APPROVED', 'REJECTED']);

export function isNominationVettingStatus(status: string): boolean {
  return NOMINATION_VETTING_STATUSES.has(status.trim().toUpperCase());
}

export function assertNominationPatchVettingAllowed(
  currentStatus: string,
  patch: { status?: string; verificationStatus?: string }
): { ok: true } | { ok: false; error: string } {
  if (!nominationFormReturned(currentStatus)) {
    if (patch.verificationStatus !== undefined) {
      return { ok: false, error: NOMINATION_FORM_NOT_RETURNED_MESSAGE };
    }
    if (patch.status !== undefined && isNominationVettingStatus(patch.status)) {
      return { ok: false, error: NOMINATION_FORM_NOT_RETURNED_MESSAGE };
    }
  }
  return { ok: true };
}
