'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import type { Task, TaskStatus } from '@/lib/types';
import {
  Plus, Trash2, RefreshCw, X, CheckSquare,
  Code2, Search, TestTube, Shield, FileText, Server, Brain, Zap,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending:     'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  in_progress: 'text-blue-400   bg-blue-400/10   border-blue-400/20',
  completed:   'text-green-400  bg-green-400/10  border-green-400/20',
  failed:      'text-red-400    bg-red-400/10    border-red-400/20',
  cancelled:   'text-slate-400  bg-slate-400/10  border-slate-400/20',
};

const STATUS_FILTERS = [
  { label: 'All',         value: '' },
  { label: 'Pending',     value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed',   value: 'completed' },
  { label: 'Failed',      value: 'failed' },
];

const AGENT_META: Record<string, { icon: React.ElementType; color: string }> = {
  coding:   { icon: Code2,     color: 'text-blue-400' },
  research: { icon: Search,    color: 'text-green-400' },
  testing:  { icon: TestTube,  color: 'text-yellow-400' },
  security: { icon: Shield,    color: 'text-red-400' },
  content:  { icon: FileText,  color: 'text-purple-400' },
  devops:   { icon: Server,    color: 'text-orange-400' },
  general:  { icon: Brain,     color: 'text-slate-400' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function duration(t: Task) {
  if (!t.startedAt) return '—';
  const end = t.completedAt ? new Date(t.completedAt) : new Date();
  const ms = end.getTime() - new Date(t.startedAt).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function AgentBadge({ agent }: { agent: string | null }) {
  if (!agent) return <span className="text-slate-600">—</span>;
  const meta = AGENT_META[agent] ?? AGENT_META.general;
  const Icon = meta.icon;
  return (
    <span className={clsx('flex items-center gap-1 text-xs', meta.color)}>
      <Icon size={11} />
      {agent}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={clsx('text-[11px] px-2 py-0.5 rounded-full border font-medium', STATUS_STYLES[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Create Task Modal ─────────────────────────────────────────────────────────

function CreateTaskModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.tasks.create(form);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
          <h2 className="text-sm font-semibold text-white">New Task</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">Title *</span>
            <input
              required autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Build a REST API for user auth"
              className="w-full bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Additional details…"
              className="w-full bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">Priority (1–10)</span>
            <input
              type="number" min={1} max={10}
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              className="w-24 bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'Creating…' : 'Create Task'}
            </button>
            <button
              type="button" onClick={onClose}
              className="flex-1 bg-[#161b27] hover:bg-[#1e2535] text-slate-300 text-sm py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Task Table ────────────────────────────────────────────────────────────────

function TaskTable({
  tasks,
  isLoading,
  onRemove,
  showOrigin = true,
}: {
  tasks: Task[] | undefined;
  isLoading: boolean;
  onRemove?: (t: Task) => void;
  showOrigin?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e2535]">
            {['Status', 'Title', showOrigin && 'Origin', 'Agent', 'Priority', 'Duration', '']
              .filter(Boolean)
              .map(h => (
                <th key={String(h)} className="text-left text-xs text-slate-500 font-medium px-5 py-3">{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Loading…</td></tr>
          )}
          {!isLoading && (!tasks || tasks.length === 0) && (
            <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">No tasks found</td></tr>
          )}
          {tasks?.map(t => (
            <>
              <tr
                key={t.id}
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="border-b border-[#1e2535] last:border-0 hover:bg-white/[0.02] transition-colors group cursor-pointer"
              >
                <td className="px-5 py-3.5"><StatusBadge status={t.status} /></td>
                <td className="px-5 py-3.5 max-w-xs">
                  <p className="text-slate-200 truncate">{t.title}</p>
                  {t.error && <p className="text-red-400 text-xs mt-0.5 truncate">{t.error}</p>}
                </td>
                {showOrigin && (
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-500">{t.origin}</span>
                  </td>
                )}
                <td className="px-5 py-3.5"><AgentBadge agent={t.assignedAgent} /></td>
                <td className="px-5 py-3.5 text-slate-400 text-sm">{t.priority}</td>
                <td className="px-5 py-3.5 text-slate-400 text-xs">{duration(t)}</td>
                <td className="px-5 py-3.5">
                  {onRemove && (
                    <button
                      onClick={e => { e.stopPropagation(); onRemove(t); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
              {expanded === t.id && (
                <tr key={`${t.id}-detail`} className="border-b border-[#1e2535]">
                  <td colSpan={7} className="px-5 pb-4 pt-0 bg-[#0a0d14]/50">
                    {t.description && (
                      <p className="text-slate-400 text-xs mb-2">{t.description}</p>
                    )}
                    <p className="text-[11px] font-mono text-slate-600">ID: {t.id}</p>
                    {t.modelUsed && (
                      <p className="text-[11px] text-slate-500 mt-0.5">Model: {t.modelUsed}</p>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabId = 'user' | 'autonomous';

export default function TasksPage() {
  const [tab, setTab]           = useState<TabId>('user');
  const [filter, setFilter]     = useState('');
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [showCreate, setCreate] = useState(false);
  const [executing, setExec]    = useState(false);
  const [execResult, setExecR]  = useState<string | null>(null);

  // User tasks via Gateway
  const userKey = ['tasks', filter, search, dateFrom, dateTo];
  const { data: userTasks, mutate: muteUser, isLoading: loadUser } = useSWR<Task[]>(
    userKey,
    () => api.tasks.list({
      status: filter || undefined,
      q: search || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }) as Promise<Task[]>,
    { refreshInterval: 5000 },
  );

  // Autonomous tasks via ai-brain (backend has no text-search — filter client-side)
  const autoKey = ['auto-tasks', filter];
  const { data: autoTasksRaw, mutate: muteAuto, isLoading: loadAuto } = useSWR<Task[]>(
    autoKey,
    () => api.autonomous.recentTasks(50, filter || undefined) as Promise<Task[]>,
    { refreshInterval: 8000 },
  );
  const autoTasks = search
    ? autoTasksRaw?.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : autoTasksRaw;

  async function removeUser(t: Task) {
    if (!confirm(`Remove "${t.title}"?`)) return;
    await api.tasks.remove(t.id);
    muteUser();
  }

  async function executeNow() {
    setExec(true);
    setExecR(null);
    try {
      const r = await api.autonomous.executeTasks(3) as {
        processed: number; succeeded: number; failed: number;
      };
      setExecR(`Processed ${r.processed} tasks — ${r.succeeded} succeeded, ${r.failed} failed`);
      muteAuto();
    } catch (e: unknown) {
      setExecR(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setExec(false);
    }
  }

  const total = tab === 'user' ? (userTasks?.length ?? 0) : (autoTasks?.length ?? 0);

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <CheckSquare size={16} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Tasks</h1>
              <p className="text-xs text-slate-500">{total} tasks · live</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => tab === 'user' ? muteUser() : muteAuto()}
              className="p-2 text-slate-500 hover:text-white border border-[#1e2535] rounded-lg transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            {tab === 'autonomous' && (
              <button
                onClick={executeNow}
                disabled={executing}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  executing
                    ? 'bg-green-600/40 text-green-300/50 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-500 text-white',
                )}
              >
                {executing
                  ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
                  : <><Zap size={14} /> Execute Now</>}
              </button>
            )}
            {tab === 'user' && (
              <button
                onClick={() => setCreate(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={14} /> New Task
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[#0f1117] border border-[#1e2535] rounded-lg p-1 w-fit">
          {([
            { id: 'user' as TabId,       label: 'User Tasks',       icon: CheckSquare },
            { id: 'autonomous' as TabId, label: 'Autonomous Tasks',  icon: Brain },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Execute result */}
        {execResult && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-300">
            {execResult}
          </div>
        )}

        {/* Search + date range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks by title or description…"
              className="w-full bg-[#0f1117] border border-[#1e2535] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          {tab === 'user' && (
            <>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-[#0f1117] border border-[#1e2535] rounded-lg px-3 py-2 text-xs text-slate-300 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-slate-600 text-xs">to</span>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-[#0f1117] border border-[#1e2535] rounded-lg px-3 py-2 text-xs text-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </>
          )}
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white bg-[#0f1117] border border-[#1e2535]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Task table */}
        {tab === 'user' ? (
          <TaskTable
            tasks={userTasks}
            isLoading={loadUser}
            onRemove={removeUser}
            showOrigin
          />
        ) : (
          <TaskTable
            tasks={autoTasks}
            isLoading={loadAuto}
            showOrigin={false}
          />
        )}
      </div>

      {showCreate && (
        <CreateTaskModal
          onClose={() => setCreate(false)}
          onSave={() => { muteUser(); setCreate(false); }}
        />
      )}
    </div>
  );
}
