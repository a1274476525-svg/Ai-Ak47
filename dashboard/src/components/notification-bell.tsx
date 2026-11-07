'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  taskId: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data, mutate } = useSWR<Notification[]>(
    'notifications-recent',
    () => api.notifications.list() as Promise<Notification[]>,
    { refreshInterval: 15000, shouldRetryOnError: false },
  );

  const notifications = data ?? [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  async function markRead(id: string) {
    await api.notifications.markRead(id);
    mutate();
  }

  async function markAllRead() {
    await api.notifications.markAllRead();
    mutate();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
      >
        <Bell size={15} />
        <span className="flex-1 text-left">Notifications</span>
        {unreadCount > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-80 bg-[#0f1117] border border-[#1e2535] rounded-xl shadow-xl z-50 max-h-96 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2535]">
              <span className="text-xs font-semibold text-slate-300">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline">
                  <CheckCheck size={11} /> mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 && (
                <p className="text-xs text-slate-500 px-4 py-6 text-center">No notifications yet</p>
              )}
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markRead(n.id)}
                  className={clsx(
                    'w-full text-left px-4 py-2.5 border-b border-[#1e2535] last:border-0 transition-colors',
                    n.isRead ? 'opacity-50 hover:opacity-80' : 'hover:bg-white/[0.03]',
                  )}
                >
                  <p className="text-xs text-slate-200">{n.title}</p>
                  {n.message && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>}
                  <p className="text-[10px] text-slate-600 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
            <Link
              href="/tasks"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-center text-[11px] text-slate-500 hover:text-slate-300 border-t border-[#1e2535]"
            >
              View all tasks →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
