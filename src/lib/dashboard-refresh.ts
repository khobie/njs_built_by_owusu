/** Dispatched after delegate edits, vetting actions, or imports so the home dashboard can refetch without a full reload. */
export const DASHBOARD_REFRESH_EVENT = 'njs-dashboard-refresh';

export function notifyDashboardRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
}
