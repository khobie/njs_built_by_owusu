/** Ghana locale/timezone for suspension restore messages shown to users. */
const ACCESS_LOCALE = 'en-GH';
const ACCESS_TIMEZONE = 'Africa/Accra';

export function isCurrentlySuspended(suspendedUntil: Date | null | undefined): boolean {
  if (!suspendedUntil) return false;
  return suspendedUntil.getTime() > Date.now();
}

export function formatAccessRestoreTime(until: Date): string {
  return until.toLocaleString(ACCESS_LOCALE, {
    timeZone: ACCESS_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function suspensionAccessMessage(until: Date): string {
  return `You can access the site again on ${formatAccessRestoreTime(until)}.`;
}

export function parseSuspendUntilInput(value: string): { ok: true; until: Date } | { ok: false; error: string } {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { ok: false, error: 'Choose when the user can access the site again.' };
  }
  const until = new Date(trimmed);
  if (Number.isNaN(until.getTime())) {
    return { ok: false, error: 'Invalid date and time.' };
  }
  if (until.getTime() <= Date.now()) {
    return { ok: false, error: 'Access time must be in the future.' };
  }
  return { ok: true, until };
}

/** Clear expired suspension in DB; returns true if a row was updated. */
export async function clearExpiredSuspensionIfNeeded(
  userId: string,
  suspendedUntil: Date | null | undefined
): Promise<boolean> {
  if (!suspendedUntil || isCurrentlySuspended(suspendedUntil)) return false;
  const { prisma } = await import('@/lib/prisma');
  await prisma.user.update({
    where: { id: userId },
    data: { suspendedUntil: null },
  });
  return true;
}
