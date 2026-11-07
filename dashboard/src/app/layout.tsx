import type { Metadata } from 'next';
import './globals.css';
import { SWRProvider } from '@/components/swr-provider';
import { DashboardShell } from '@/components/dashboard-shell';

export const metadata: Metadata = {
  title: 'AI OS — Dashboard',
  description: 'AI Operating System — Admin Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0d14] text-slate-200">
        <SWRProvider>
          <DashboardShell>{children}</DashboardShell>
        </SWRProvider>
      </body>
    </html>
  );
}
