'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ShieldAlert, Check, X, Clock, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface PendingAction {
  id: string;
  actionType: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
}

function StatusBadge({ status }: { status: PendingAction['status'] }) {
  const styles: Record<PendingAction['status'], string> = {
    pending:  'bg-yellow-500/10 text-yellow-400',
    approved: 'bg-blue-500/10 text-blue-400',
    executed: 'bg-green-500/10 text-green-400',
    rejected: 'bg-slate-500/10 text-slate-400',
    failed:   'bg-red-500/10 text-red-400',
  };
  return <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium capitalize', styles[status])}>{status}</span>;
}

export default function ApprovalsPage() {
  const { data, mutate, isLoading } = useSWR<PendingAction[]>('approvals-list', () => api.approvals.list() as Promise<PendingAction[]>, { refreshInterval: 8000 });
  const [busy, setBusy] = useState<string | null>(null);

  const actions = data ?? [];
  const pending = actions.filter(a => a.status === 'pending');
  const decided = actions.filter(a => a.status !== 'pending');

  async function approve(id: string) {
    setBusy(id);
    try { await api.approvals.approve(id); await mutate(); } finally { setBusy(null); }
  }

  async function reject(id: string) {
    setBusy(id);
    try { await api.approvals.reject(id); await mutate(); } finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-yellow-600/20 border border-yellow-500/30 flex items-center justify-center">
            <ShieldAlert size={16} className="text-yellow-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Approvals</h1>
            <p className="text-xs text-slate-500">Risky actions (terminal, docker, workspace writes) wait here until approved</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-yellow-400">
            <Clock size={14} /> Pending ({pending.length})
          </h2>
          {pending.length === 0 && !isLoading && (
            <p className="text-sm text-slate-500">Nothing waiting on approval.</p>
          )}
          {pending.map(a => (
            <div key={a.id} className="bg-[#0f1117] border border-yellow-500/20 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-white whitespace-pre-wrap break-words font-mono">{a.summary}</p>
                <p className="text-[11px] text-slate-500 mt-1">{a.actionType} · {new Date(a.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <button
                  onClick={() => approve(a.id)}
                  disabled={busy === a.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
                >
                  {busy === a.id ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />} Approve
                </button>
                <button
                  onClick={() => reject(a.id)}
                  disabled={busy === a.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2535] hover:bg-red-900/40 text-slate-300 hover:text-red-300 disabled:opacity-50"
                >
                  <X size={12} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400">History</h2>
          {decided.length === 0 && <p className="text-sm text-slate-500">No decided actions yet.</p>}
          {decided.map(a => (
            <div key={a.id} className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-slate-300 truncate">{a.summary}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {a.actionType} · {new Date(a.createdAt).toLocaleString()}
                  {a.error && <span className="text-red-400"> — {a.error}</span>}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
