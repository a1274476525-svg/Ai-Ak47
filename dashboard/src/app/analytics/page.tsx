'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { BarChart3, ListChecks, MessageSquare, Coins, Sparkles, Database, RefreshCw, ShieldCheck } from 'lucide-react';

// Dark-mode validated categorical palette (dataviz skill reference palette, dark column)
const CATEGORICAL = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
const STATUS_GOOD = '#0ca30c';
const STATUS_CRITICAL = '#d03b3b';

// ── Types ──────────────────────────────────────────────────────────────────

interface Overview {
  tasks: { total: number; by_status: Record<string, number>; success_rate: number };
  messages: { total: number; conversations: number };
  agent_runs: { total: number; avg_dur_ms: number };
  cost: { total_usd: number; total_tokens: number };
  skills: { total: number; avg_level: number; mastered: number };
  knowledge_items: number;
}

interface TasksByAgent {
  by_agent: Array<{ agent: string; total: number; completed: number; failed: number; success_rate: number; avg_duration_ms: number }>;
}

interface ModelUsage {
  agent_runs: Array<{ model: string; runs: number; success_rate: number; cost_usd: number; avg_ms: number }>;
}

interface SkillProgress {
  by_category: Record<string, Array<{ name: string; level: number; target: number; gap: number; mastered: boolean }>>;
}

interface Timeline {
  tasks: Array<{ day: string; total: number; completed: number; failed: number }>;
}

interface BudgetStatus {
  daily_limit_usd: number | null;
  monthly_limit_usd: number | null;
  enabled: boolean;
  today_spend_usd: number;
  month_spend_usd: number;
}

// ── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, sub, accent }: {
  icon: typeof BarChart3; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={13} style={{ color: accent }} />
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ── Horizontal bar chart (categorical identity, fixed color order) ──────────

function BarRow({ label, value, max, color, valueLabel }: {
  label: string; value: number; max: number; color: string; valueLabel: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-slate-400 truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 bg-[#1e2535]/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
          title={valueLabel}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-slate-300 tabular-nums">{valueLabel}</span>
    </div>
  );
}

function TasksByAgentChart({ data }: { data: TasksByAgent['by_agent'] }) {
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <ListChecks size={14} className="text-blue-400" /> Tasks by Agent
        <span className="text-xs text-slate-500 font-normal">(last 30 days)</span>
      </h2>
      {data.length === 0 && <p className="text-sm text-slate-500">No task data yet.</p>}
      <div className="space-y-3">
        {data.map((d, i) => (
          <BarRow
            key={d.agent}
            label={d.agent}
            value={d.total}
            max={max}
            color={CATEGORICAL[i % CATEGORICAL.length]}
            valueLabel={`${d.total} (${d.success_rate}%)`}
          />
        ))}
      </div>
    </div>
  );
}

function ModelUsageChart({ data }: { data: ModelUsage['agent_runs'] }) {
  const max = Math.max(...data.map(d => d.cost_usd), 0.0001);
  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Coins size={14} className="text-yellow-400" /> Model Cost
        <span className="text-xs text-slate-500 font-normal">(last 30 days)</span>
      </h2>
      {data.length === 0 && <p className="text-sm text-slate-500">No model usage data yet.</p>}
      <div className="space-y-3">
        {data.map((d, i) => (
          <BarRow
            key={d.model}
            label={d.model}
            value={d.cost_usd}
            max={max}
            color={CATEGORICAL[i % CATEGORICAL.length]}
            valueLabel={`$${d.cost_usd.toFixed(4)}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Timeline line chart (status colors — completed vs failed) ───────────────

function TimelineChart({ data }: { data: Timeline['tasks'] }) {
  const W = 640, H = 160, PAD = 24;
  const max = Math.max(...data.map(d => d.total), 1);
  const n = data.length;

  const x = (i: number) => n <= 1 ? PAD : PAD + (i / (n - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const path = (key: 'completed' | 'failed') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  const tickEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 size={14} className="text-blue-400" /> Task Completion Timeline
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_GOOD }} /> Completed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_CRITICAL }} /> Failed</span>
        </div>
      </div>

      {n === 0 ? (
        <p className="text-sm text-slate-500">No tasks in this period.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#383835" strokeWidth={1} />
          <path d={path('completed')} fill="none" stroke={STATUS_GOOD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <path d={path('failed')} fill="none" stroke={STATUS_CRITICAL} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {data.map((d, i) => (i % tickEvery === 0 || i === n - 1) ? (
            <text key={d.day} x={x(i)} y={H - 6} fontSize={8} fill="#898781" textAnchor="middle">
              {d.day.slice(5)}
            </text>
          ) : null)}
        </svg>
      )}
    </div>
  );
}

// ── Skills by category ────────────────────────────────────────────────────

function SkillsChart({ data }: { data: SkillProgress['by_category'] }) {
  const categories = Object.entries(data);
  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Sparkles size={14} className="text-violet-400" /> Skill Progress vs Target
      </h2>
      {categories.length === 0 && <p className="text-sm text-slate-500">No skills tracked yet.</p>}
      {categories.map(([cat, skills]) => (
        <div key={cat} className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">{cat}</p>
          {skills.map(s => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs text-slate-300 truncate" title={s.name}>{s.name}</span>
              <div className="flex-1 h-3 bg-[#1e2535]/40 rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min((s.level / Math.max(s.target, 1)) * 100, 100)}%`, backgroundColor: s.mastered ? STATUS_GOOD : '#3987e5' }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-[11px] text-slate-400 tabular-nums">{s.level}/{s.target}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Budget guardrail panel ──────────────────────────────────────────────────

function BudgetPanel() {
  const { data, mutate, isLoading } = useSWR<BudgetStatus>('budget-status', () => api.budget.get() as Promise<BudgetStatus>, { refreshInterval: 30000 });
  const [daily, setDaily]     = useState('');
  const [monthly, setMonthly] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!data) return;
    setDaily(data.daily_limit_usd?.toString() ?? '');
    setMonthly(data.monthly_limit_usd?.toString() ?? '');
    setEnabled(data.enabled);
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      await api.budget.update({
        daily_limit_usd: daily.trim() ? Number(daily) : null,
        monthly_limit_usd: monthly.trim() ? Number(monthly) : null,
        enabled,
      });
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  const dailyPct = data?.daily_limit_usd ? Math.min((data.today_spend_usd / data.daily_limit_usd) * 100, 100) : 0;
  const overDaily = data?.enabled && data.daily_limit_usd != null && data.today_spend_usd >= data.daily_limit_usd;

  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck size={14} className="text-green-400" /> Budget Guardrail
        </h2>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-blue-500" />
          Enforce limits
        </label>
      </div>

      {!isLoading && data && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Today: ${data.today_spend_usd.toFixed(2)}{data.daily_limit_usd != null ? ` / $${data.daily_limit_usd.toFixed(2)}` : ''}</span>
            {overDaily && <span className="text-red-400 font-medium">Daily limit reached — new runs are blocked</span>}
          </div>
          {data.daily_limit_usd != null && (
            <div className="h-2 bg-[#1e2535]/40 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${dailyPct}%`, backgroundColor: overDaily ? '#d03b3b' : '#3987e5' }} />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] text-slate-500 mb-1 block">Daily limit (USD)</span>
          <input
            value={daily}
            onChange={e => setDaily(e.target.value)}
            placeholder="unlimited"
            inputMode="decimal"
            className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-500 mb-1 block">Monthly limit (USD)</span>
          <input
            value={monthly}
            onChange={e => setMonthly(e.target.value)}
            placeholder="unlimited"
            inputMode="decimal"
            className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </label>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50"
      >
        {saving ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Save
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data: overview, isLoading: loadingOverview } = useSWR<Overview>('analytics-overview', () => api.analytics.overview() as Promise<Overview>, { refreshInterval: 30000 });
  const { data: tasksByAgent }  = useSWR<TasksByAgent>('analytics-tasks', () => api.analytics.tasks(30) as Promise<TasksByAgent>, { refreshInterval: 30000 });
  const { data: modelUsage }    = useSWR<ModelUsage>('analytics-models', () => api.analytics.models(30) as Promise<ModelUsage>, { refreshInterval: 30000 });
  const { data: skillProgress } = useSWR<SkillProgress>('analytics-skills', () => api.analytics.skills() as Promise<SkillProgress>, { refreshInterval: 30000 });
  const { data: timeline }      = useSWR<Timeline>('analytics-timeline', () => api.analytics.timeline(30) as Promise<Timeline>, { refreshInterval: 30000 });

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <BarChart3 size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Analytics</h1>
            <p className="text-xs text-slate-500">Tasks · Cost · Models · Skills — Phase 5</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loadingOverview && <p className="text-sm text-slate-500">Loading…</p>}

        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile icon={ListChecks}     label="Tasks"        value={String(overview.tasks.total)}        sub={`${overview.tasks.success_rate}% success`} accent="#3987e5" />
            <StatTile icon={MessageSquare}  label="Messages"     value={String(overview.messages.total)}     sub={`${overview.messages.conversations} conversations`} accent="#199e70" />
            <StatTile icon={RefreshCw}      label="Agent Runs"   value={String(overview.agent_runs.total)}   sub={`${overview.agent_runs.avg_dur_ms}ms avg`} accent="#9085e9" />
            <StatTile icon={Coins}          label="Cost"         value={`$${overview.cost.total_usd.toFixed(2)}`} sub={`${overview.cost.total_tokens.toLocaleString()} tokens`} accent="#c98500" />
            <StatTile icon={Sparkles}       label="Skills"       value={`${overview.skills.mastered}/${overview.skills.total}`} sub={`avg level ${overview.skills.avg_level}`} accent="#d55181" />
            <StatTile icon={Database}       label="Knowledge"    value={String(overview.knowledge_items)}    sub="items indexed" accent="#008300" />
          </div>
        )}

        {timeline && <TimelineChart data={timeline.tasks} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {tasksByAgent && <TasksByAgentChart data={tasksByAgent.by_agent} />}
          {modelUsage && <ModelUsageChart data={modelUsage.agent_runs} />}
        </div>

        <BudgetPanel />

        {skillProgress && <SkillsChart data={skillProgress.by_category} />}
      </div>
    </div>
  );
}
