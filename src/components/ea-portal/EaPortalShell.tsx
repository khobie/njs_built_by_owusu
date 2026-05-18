'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { canAccessEaPortal } from '@/lib/ea-portal-access';
import { EA_PORTAL_REFRESH_EVENT } from '@/lib/ea-portal-refresh';

type NavItem = { href: string; label: string; exact?: boolean };

const nav: readonly NavItem[] = [
  { href: '/ea-portal', label: 'Dashboard', exact: true },
  { href: '/ea-portal/areas', label: 'Electoral areas' },
  { href: '/ea-portal/records', label: 'Records' },
  { href: '/ea-portal/reassign', label: 'Reassign' },
  { href: '/ea-portal/reports', label: 'Reports' },
];

export function EaPortalShell({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [userLabel, setUserLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        router.replace('/login');
        return;
      }
      const data = await res.json();
      const role = data?.user?.role as string | undefined;
      if (!role || !canAccessEaPortal(role)) {
        router.replace('/');
        return;
      }
      if (!cancelled) {
        setUserLabel(`${data.user?.name ?? ''} · ${role}`);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const fn = () => {
      onRefresh?.();
      router.refresh();
    };
    window.addEventListener(EA_PORTAL_REFRESH_EVENT, fn);
    return () => window.removeEventListener(EA_PORTAL_REFRESH_EVENT, fn);
  }, [onRefresh, router]);

  if (!ready) {
    return (
      <div className="ea-portal-app">
        <div className="ea-portal-main" style={{ padding: '3rem', textAlign: 'center' }}>
          Loading Electoral Area Portal…
        </div>
      </div>
    );
  }

  return (
    <div className="ea-portal-app">
      <aside className="ea-portal-sidebar">
        <div className="ea-portal-brand">
          <span className="ea-portal-brand-title">EA Portal</span>
          <span className="ea-portal-brand-sub">Area management</span>
        </div>
        <nav className="ea-portal-nav">
          {nav.map((item) => {
            const isActive = item.exact === true
              ? pathname === item.href || pathname === `${item.href}/`
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ea-portal-nav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ea-portal-sidebar-footer">
          <Link href="/" className="ea-portal-nav-link subtle">
            ← Main app
          </Link>
          <div className="ea-portal-user">{userLabel}</div>
        </div>
      </aside>
      <main className="ea-portal-main">{children}</main>
    </div>
  );
}
