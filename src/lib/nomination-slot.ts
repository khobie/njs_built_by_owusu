import type { Prisma } from '@prisma/client';

export type NominationSlot = {
  phoneNumber: string;
  electoralAreaId: string;
  position: string;
  pollingStationCode: string | null;
};

export function normalizePollingStationCode(code: string | null | undefined): string | null {
  if (code == null) return null;
  const t = String(code).trim();
  return t === '' ? null : t;
}

/** Exact match for one nomination slot (station distinguishes rows inside the same electoral area). */
export function nominationSlotWhere(slot: NominationSlot): Prisma.CandidateWhereInput {
  return {
    phoneNumber: slot.phoneNumber,
    electoralAreaId: slot.electoralAreaId,
    position: slot.position,
    pollingStationCode: slot.pollingStationCode,
  };
}
