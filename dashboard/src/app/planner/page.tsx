'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import type { PlanResponse, PlannedTask } from '@/lib/types';
import {
  Target, Clock, CheckCircle2,
  ChevronRight, ArrowRight, RefreshCw, Play,
  Code2, Search, TestTube, Shield, FileText, Server, Brain,
} from 'lucide-react';
import { clsx } from 'clsx';

// ── Agent config ──────────────────────────────────────────────────────────────

const AGENT_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  coding:   { icon: Code2,     color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  research: { icon: Search,    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  testing:  { icon: TestTube,  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  security: { icon: Shield,    color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  content:  { icon: FileText,  color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  devops:   { icon: Server,    color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  general:  { icon: Brain,     color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
};

function priorityBadge(p: number) {
  if (p >= 9) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (p >= 7) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (p >= 5) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, isStored }: { task: PlannedTask; isStored: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = AGENT_META[task.agent] ?? AGENT_META.general;
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-[#1e2535] bg-[#0f1117] overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Step number */}
        <div className="shrink-0 w-7 h-7 rounded-full border border-[#1e2535] bg-[#0a0d14] flex items-center justify-center text-xs text-slate-500 font-mono mt-0.5">
          {task.index + 1}
        </div>

        {/* Agent badge */}
        <div className={clsx('shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center mt-0.5', meta.bg)}>
          <Icon size={13} className={meta.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white">{task.title}</p>
            {isStored && (
              <span title="Saved to DB" className="shrink-0 inline-flex">
                <CheckCircle2 size={12} className="text-green-400" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
            <span className={clsx('flex items-center gap-1', meta.color)}>{task.agent}</span>
            <span className="flex items-center gap-0.5"><Clock size={10} /> {task.estimated_minutes}m</span>
            {task.depends_on.length > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowRight size={10} /> after #{task.depends_on.map(d => d + 1).join(', #')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border', priorityBadge(task.priority))}>
            P{task.priority}
          </span>
          <ChevronRight
            size={14}
            className={clsx('text-slate-600 transition-transform', expanded && 'rotate-90')}
          />
        </div>
      </div>

      {expanded && task.description && (
        <div className="border-t border-[#1e2535] px-4 py-3 text-sm text-slate-300 leading-relaxed bg-[#0a0d14]/40">
          {task.description}
        </div>
      )}
    </div>
  );
}

// ── Dependency flow ───────────────────────────────────────────────────────────

function DependencyFlow({ tasks }: { tasks: PlannedTask[] }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {tasks.map((t, i) => {
        const meta = AGENT_META[t.agent] ?? AGENT_META.general;
        const Icon = meta.icon;
        return (
          <div key={t.index} className="flex items-center gap-2">
            <div
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium',
                meta.bg, meta.color,
              )}
              title={t.title}
            >
              <Icon size={11} />
              <span className="max-w-[120px] truncate">{t.title}</span>
            </div>
            {i < tasks.length - 1 && (
              <ArrowRight size={12} className="text-slate-600 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EXAMPLE_GOALS = [
  'Build a REST API for a todo app with authentication and PostgreSQL',
  'Create a data pipeline that processes CSV files and generates reports',
  'Implement a real-time chat feature using WebSockets',
  'Set up CI/CD pipeline with Docker and GitHub Actions',
  'Build a web scraper that monitors competitor pricing',
];

export default function PlannerPage() {
  const [goal, setGoal] = useState('');
  const [planning, setPanning] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeInDb, setStoreInDb] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [goal]);

  async function submitGoal() {
    if (!goal.trim() || planning) return;
    setPanning(true);
    setError(null);
    setPlan(null);

    try {
      const res = await api.autonomous.plan({ goal: goal.trim(), store: storeInDb }) as PlanResponse;
      setPlan(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPanning(false);
    }
  }

  const totalMin = plan?.estimated_total_minutes ?? 0;
  const hours = Math.floor(totalMin / 60);
  const mins  = totalMin % 60;

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Target size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Goal Planner</h1>
            <p className="text-xs text-slate-500">Autonomous task decomposition via LangGraph</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Goal Input */}
        <div className="rounded-xl border border-[#1e2535] bg-[#0f1117] p-5 space-y-4">
          <label className="text-sm font-medium text-slate-300">Describe your goal</label>
          <textarea
            ref={textareaRef}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitGoal(); }}
            placeholder="e.g. Build a REST API for a todo app with authentication and PostgreSQL…"
            rows={3}
            className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none leading-relaxed"
          />

          {/* Examples */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_GOALS.map((eg, i) => (
              <button
                key={i}
                onClick={() => setGoal(eg)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-[#0a0d14] border border-[#1e2535] text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors truncate max-w-[260px]"
              >
                {eg}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={storeInDb}
                onChange={e => setStoreInDb(e.target.checked)}
                className="rounded border-slate-600 bg-transparent"
              />
              Save tasks to database
            </label>
            <button
              onClick={submitGoal}
              disabled={!goal.trim() || planning}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                !goal.trim() || planning
                  ? 'bg-blue-600/40 text-blue-300/50 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white',
              )}
            >
              {planning ? (
                <><RefreshCw size={14} className="animate-spin" /> Planning…</>
              ) : (
                <><Play size={14} /> Decompose Goal</>
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-600">Ctrl+Enter to submit</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Plan result */}
        {plan && (
          <div className="space-y-5">
            {/* Summary card */}
            <div className="rounded-xl border border-[#1e2535] bg-[#0f1117] p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-white">{plan.goal}</h2>
                  <p className="text-sm text-slate-400 leading-relaxed">{plan.breakdown}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold text-white">
                    {hours > 0 ? `${hours}h ${mins}m` : `${totalMin}m`}
                  </p>
                  <p className="text-[11px] text-slate-500">estimated</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 pt-2 border-t border-[#1e2535] text-sm">
                <span className="text-slate-400"><span className="text-white font-medium">{plan.tasks.length}</span> tasks</span>
                {plan.task_ids.length > 0 && (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle2 size={12} /> Saved to database
                  </span>
                )}
              </div>

              {/* Flow diagram */}
              {plan.tasks.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] text-slate-600 mb-2 uppercase tracking-wider">Execution flow</p>
                  <DependencyFlow tasks={plan.tasks} />
                </div>
              )}
            </div>

            {/* Task list */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Task Breakdown
              </h3>
              {plan.tasks.map(task => (
                <TaskCard
                  key={task.index}
                  task={task}
                  isStored={plan.task_ids.length > task.index}
                />
              ))}
            </div>

            {/* New goal button */}
            <button
              onClick={() => { setPlan(null); setGoal(''); }}
              className="w-full py-3 rounded-xl border border-dashed border-[#1e2535] text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
            >
              Plan another goal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
