import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createAuthToken, getAuthCookieMaxAgeSeconds, getAuthCookieName } from '@/lib/auth';
import type { Role } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email, identifier, password } = body as {
      username?: string;
      email?: string;
      identifier?: string;
      password?: string;
    };
    const loginId = (username || identifier || email || '').trim();

    if (!loginId || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: loginId }, { name: loginId }],
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };

    // Get electoral areas if vetting panel
    const userAreas = user.role === 'VETTING_PANEL'
      ? await prisma.userElectoralArea.findMany({
          where: { userId: user.id },
          include: { area: true },
        })
      : [];

    const token = createAuthToken(user.id, user.role as Role);

    const response = NextResponse.json({
      message: 'Login successful',
      user: safeUser,
      userAreas: user.role === 'VETTING_PANEL' ? userAreas.map(ua => ua.area) : [],
    });
    response.cookies.set({
      name: getAuthCookieName(),
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getAuthCookieMaxAgeSeconds(),
    });
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { error: 'Failed to login' },
      { status: 500 }
    );
  }
}
