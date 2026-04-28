import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      electoralAreas: { select: { areaCode: true } },
    },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (sessionUser.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { name, email, password, role, areaCodes = [] } = body as {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'FORM_ISSUER' | 'VETTING_PANEL';
    areaCodes?: string[];
  };

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: 'Email already exists' }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: { name, email, passwordHash, role, isActive: true },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  if (role === 'VETTING_PANEL' && areaCodes.length) {
    await prisma.userElectoralArea.createMany({
      data: areaCodes.map((areaCode) => ({ userId: created.id, areaCode })),
    });
  }

  return NextResponse.json(created, { status: 201 });
}

