import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  canAccessEaPortal,
  getEaPortalScopeAreaIds,
  hasFullEaPortalAccess,
} from '@/lib/ea-portal-access';

export type EaPortalGateUser = { id: string; name: string; email: string; role: string };

export type EaPortalGate =
  | {
      ok: true;
      user: EaPortalGateUser;
      scope: string[] | null;
      full: boolean;
    }
  | { ok: false; response: NextResponse };

export async function requireEaPortal(request: NextRequest): Promise<EaPortalGate> {
  const user = await getSessionUser(request);
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!canAccessEaPortal(user.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const scope = await getEaPortalScopeAreaIds(user.id, user.role);
  if (scope !== null && scope.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No Electoral Area Portal assignments for this account.' },
        { status: 403 }
      ),
    };
  }
  return {
    ok: true,
    user,
    scope,
    full: hasFullEaPortalAccess(user.role),
  };
}

export function assertAreaIdAllowed(areaId: string | null | undefined, scope: string[] | null): boolean {
  if (!areaId) return true;
  if (scope === null) return true;
  return scope.includes(areaId);
}
