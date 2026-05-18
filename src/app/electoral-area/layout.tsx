import type { ReactNode } from 'react';
import { EaPortalShell } from '@/components/ea-portal/EaPortalShell';

export default function ElectoralAreaLayout({ children }: { children: ReactNode }) {
  return <EaPortalShell>{children}</EaPortalShell>;
}
