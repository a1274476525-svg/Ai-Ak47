'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Cpu, CheckSquare, MessageSquare,
  Brain, Database, Zap, Sparkles, Target, BookOpen, Rss, LogOut,
  Network, Globe, Code2, Terminal, RefreshCw, BarChart3, Puzzle, ShieldAlert,
} from 'lucide-react';
import { clearToken, api } from '@/lib/api';
import { NotificationBell } from './notification-bell';

const NAV = [
  { href: '/',               icon: LayoutDashboard, label: 'Overview' },
  { href: '/providers',      icon: Cpu,             label: 'AI Providers' },
  { href: '/tasks',          icon: CheckSquare,     label: 'Tasks' },
  { href: '/chat',           icon: MessageSquare,   label: 'Chat' },
  { href: '/conversations',  icon: BookOpen,        label: 'Conversations' },
  { href: '/memory',         icon: Database,        label: 'Memory' },
  { href: '/skills',         icon: Sparkles,        label: 'Skills' },
  { href: '/planner',        icon: Target,          label: 'Planner' },
  { href: '/research',       icon: Rss,             label: 'Research' },
  { href: '/knowledge',      icon: Network,         label: 'Knowledge Graph' },
  { href: '/world-model',    icon: Globe,           label: 'World Model' },
  { href: '/coding-brain',   icon: Code2,           label: 'Coding Brain' },
  { href: '/self-coding',    icon: RefreshCw,       label: 'Self-Coding Loop' },
  { href: '/vscode',         icon: Code2,           label: 'VSCode Workspace' },
  { href: '/tools',          icon: Terminal,        label: 'Tools' },
  { href: '/approvals',      icon: ShieldAlert,     label: 'Approvals' },
  { href: '/analytics',      icon: BarChart3,       label: 'Analytics' },
  { href: '/extensions',     icon: Puzzle,          label: 'Extensions' },
];

export function Sidebar() {
  const path   = usePathname();
  const router = useRouter();

  const { data: pendingApprovals } = useSWR<unknown[]>(
    'sidebar-pending-approvals',
    () => api.approvals.list('pending') as Promise<unknown[]>,
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  const pendingCount = pendingApprovals?.length ?? 0;

  function logout() {
    clearToken();
    router.push('/login');
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col border-r border-[#1e2535] bg-[#0f1117] z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1e2535]">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <Brain size={15} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">AI OS</p>
          <p className="text-[10px] text-slate-500 mt-0.5">v0.5.0 — Phase 5</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
              )}
            >
              <Icon size={15} />
              <span className="flex-1">{label}</span>
              {href === '/approvals' && pendingCount > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-[#1e2535] space-y-0.5">
        <NotificationBell />
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
          <Zap size={12} className="text-green-400" />
          <span>System running</span>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-400/5 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
