'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — executive records merged into delegate / vetting workflow. */
export default function EaPortalRecordsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ea-portal/vetting');
  }, [router]);
  return <p style={{ padding: '2rem' }}>Redirecting to vetting panel…</p>;
}
