'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { hasSystemWideAccess, isAdminRole } from '@/lib/roles';

function IconPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" strokeLinecap="round" />
      <path d="M13 13h4M13 17h4" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconFilePlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

export function AppShell({ activeHref, children }: { activeHref: string; children: ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<string>('');

  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        const data = await res.json();
        setRole(data?.user?.role || '');
        return data;
      })
      .catch(() => router.push('/login'));
  }, [router]);

  const dash = { href: '/', label: 'Dashboard', icon: IconHome } as const;

  const nav = (() => {
    if (!role) return [dash];
    if (hasSystemWideAccess(role)) {
      return [
        dash,
        { href: '/form-issuing', label: 'Form Issuing', icon: IconFilePlus },
        { href: '/edit-candidate', label: 'Edit candidate', icon: IconPencil },
        { href: '/vetting', label: 'Vetting', icon: IconClipboard },
        { href: '/polling-stations', label: 'Poll stations', icon: IconBuilding },
        { href: '/reports', label: 'Reports', icon: IconDoc },
        ...(isAdminRole(role) ? ([{ href: '/accounts', label: 'Accounts', icon: IconUsers }] as const) : []),
      ] as const;
    }
    if (role === 'FORM_ISSUER') {
      return [
        dash,
        { href: '/form-issuing', label: 'Form Issuing', icon: IconFilePlus },
        { href: '/edit-candidate', label: 'Edit candidate', icon: IconPencil },
      ] as const;
    }
    if (role === 'VETTING_PANEL') {
      return [dash, { href: '/vetting', label: 'Vetting', icon: IconClipboard }] as const;
    }
    return [dash] as const;
  })();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="app-sidebar-brand">
          <h2>NJS Electoral</h2>
          <p>New Juaben South · Delegate management</p>
        </div>
        <nav className="app-sidebar-nav">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`app-sidebar-link${activeHref === href ? ' active' : ''}`} prefetch>
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: '0.75rem' }}>
          <button type="button" className="app-sidebar-link" onClick={logout} style={{ width: '100%', border: 'none', background: 'transparent' }}>
            <IconUsers />
            Logout
          </button>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
