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
        OR: [
          { email: { equals: loginId, mode: 'insensitive' } },
          { name: { equals: loginId, mode: 'insensitive' } },
        ],
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

    let eaPortalAreas: { id: string; name: string; region: string }[] = [];
    if (user.role === 'EA_OFFICER') {
      const links = await prisma.userEaPortalArea.findMany({
        where: { userId: user.id },
        select: { area: { select: { id: true, name: true, region: true } } },
      });
      eaPortalAreas = links.map((l) => l.area);
    }

    const token = createAuthToken(user.id, user.role as Role);

    const response = NextResponse.json({
      message: 'Login successful',
      user: safeUser,
      userAreas: user.role === 'VETTING_PANEL' ? userAreas.map(ua => ua.area) : [],
      eaPortalAreas,
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
    const message = error instanceof Error ? error.message : String(error);
    const dbMisconfigured =
      /DATABASE_URL|datasource|PrismaClientInitializationError|postgresql:\/\//i.test(message) &&
      /must start with the protocol|ECONNREFUSED|P1001|Can't reach database/i.test(message);
    const errorText = dbMisconfigured
      ? 'Database not reachable. Set a valid DATABASE_URL in .env (postgresql://…), run migrations, then seed. See .env.example.'
      : 'Failed to login';
    return NextResponse.json({ error: errorText }, { status: 500 });
  }
}
