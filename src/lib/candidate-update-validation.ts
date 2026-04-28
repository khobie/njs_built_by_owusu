import { prisma } from '@/lib/prisma';

/**
 * Ensures polling_station_code exists and belongs to the given electoral area (core data rule).
 */
export async function assertPollingStationBelongsToArea(
  pollingStationCode: string,
  electoralAreaId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const station = await prisma.pollingStation.findUnique({
    where: { code: pollingStationCode },
    select: { electoralAreaId: true },
  });
  if (!station) {
    return { ok: false, message: 'Invalid polling station code.' };
  }
  if (station.electoralAreaId !== electoralAreaId) {
    return { ok: false, message: 'Polling station does not belong to the selected electoral area.' };
  }
  return { ok: true };
}
