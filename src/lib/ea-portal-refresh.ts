/** Dispatched after EA portal CRUD so dashboard/report views refetch without a full reload. */
export const EA_PORTAL_REFRESH_EVENT = 'njs-ea-portal-refresh';

export function notifyEaPortalRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EA_PORTAL_REFRESH_EVENT));
}
