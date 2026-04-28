import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const AUTH_COOKIE = 'auth_token';
const AUTH_TTL_SECONDS = 60 * 60 * 8; // 8 hours

type SessionPayload = {
  userId: string;
  role: 'ADMIN' | 'FORM_ISSUER' | 'VETTING_PANEL';
  exp: number;
};

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET || 'dev-secret-change-me';
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

export function createAuthToken(userId: string, role: SessionPayload['role']): string {
  const payload: SessionPayload = {
    userId,
    role,
    exp: Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS,
  };
  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const mac = sign(payloadEncoded);
  return `${payloadEncoded}.${mac}`;
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE;
}

export function getAuthCookieMaxAgeSeconds(): number {
  return AUTH_TTL_SECONDS;
}

export function verifyAuthToken(token: string): SessionPayload | null {
  const [payloadEncoded, mac] = token.split('.');
  if (!payloadEncoded || !mac) return null;
  const expected = sign(payloadEncoded);
  try {
    const a = Buffer.from(mac, 'utf-8');
    const b = Buffer.from(expected, 'utf-8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (!payload.userId || !payload.role || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSessionUser(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyAuthToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return user;
}

export async function getSessionAreaCodes(userId: string): Promise<string[]> {
  const rows = await prisma.userElectoralArea.findMany({
    where: { userId },
    select: { areaCode: true },
  });
  return rows.map((r) => r.areaCode);
}

