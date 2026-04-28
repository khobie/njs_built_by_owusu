import { NextRequest, NextResponse } from 'next/server';
import { getSessionAreaCodes, getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    const userAreas = user.role === 'VETTING_PANEL' ? await getSessionAreaCodes(user.id) : [];

    return NextResponse.json({
      user,
      userAreas,
    });
  } catch (error) {
    console.error('Session check failed:', error);
    return NextResponse.json(
      { error: 'Session check failed' },
      { status: 500 }
    );
  }
}
