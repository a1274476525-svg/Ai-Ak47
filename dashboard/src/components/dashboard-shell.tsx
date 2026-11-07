'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Sidebar } from './sidebar';
import { getToken } from '@/lib/api';

const PUBLIC_PATHS = ['/login'];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!isPublic && !getToken()) {
      router.replace('/login');
    }
  }, [isPublic, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen">{children}</main>
    </>
  );
}
