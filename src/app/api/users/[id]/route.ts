import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (sessionUser.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id } = params;
  const {
    name,
    role,
    isActive,
    areaCodes,
  } = body as { name?: string; role?: 'ADMIN' | 'FORM_ISSUER' | 'VETTING_PANEL'; isActive?: boolean; areaCodes?: string[] };

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  if (areaCodes) {
    await prisma.userElectoralArea.deleteMany({ where: { userId: id } });
    if ((role ?? user.role) === 'VETTING_PANEL' && areaCodes.length > 0) {
      await prisma.userElectoralArea.createMany({
        data: areaCodes.map((areaCode) => ({ userId: id, areaCode })),
      });
    }
  }

  return NextResponse.json(user);
}

