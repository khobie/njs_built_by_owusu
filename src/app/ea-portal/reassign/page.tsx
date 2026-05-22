'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Reassignment is handled in the vetting panel (edit existing record). */
export default function EaPortalReassignRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ea-portal/vetting');
  }, [router]);
  return <p style={{ padding: '2rem' }}>Redirecting to vetting panel…</p>;
}
