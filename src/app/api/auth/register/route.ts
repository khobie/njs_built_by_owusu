import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminRole } from '@/lib/roles';
import {
  createUserAccount,
  UserAccountError,
  validateCreateUserInput,
  type CreateUserInput,
} from '@/lib/user-account';

/** Admin-only user registration (same rules as POST /api/users). */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdminRole(sessionUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as CreateUserInput;
    const validated = validateCreateUserInput(body, sessionUser.role);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const user = await createUserAccount(validated.data);
    return NextResponse.json(
      { message: 'User created successfully', user },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof UserAccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Registration failed:', e);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
