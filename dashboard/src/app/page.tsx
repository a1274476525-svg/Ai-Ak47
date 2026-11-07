'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Provider, Task, Skill } from '@/lib/types';
import {
  Cpu, CheckSquare, Brain, Activity, AlertCircle,
  Sparkles, Target, TrendingUp, Circle,
} from 'lucide-react';
import { clsx } from 'clsx';

const STATUS_COLORS: Record<string, string> = {
  pending:     'text-yellow-400 bg-yellow-400/10',
  in_progress: 'text-blue-400 bg-blue-400/10',
  completed:   'text-green-400 bg-green-400/10',
  failed:      'text-red-400 bg-red-400/10',
  cancelled:   'text-slate-400 bg-slate-400/10',
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue:   'text-blue-400 bg-blue-400/10',
    green:  'text-green-400 bg-green-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    orange: 'text-orange-400 bg-orange-400/10',
    red:    'text-red-400 bg-red-400/10',
  };
  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', colorMap[color] ?? colorMap.blue)}>
          <Icon size={15} />
        </span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── Mini skill bar ────────────────────────────────────────────────────────────

function MiniSkill({ skill }: { skill: Skill }) {
  const pct = Math.min(skill.level, 100);
  const color =
    pct >= 80 ? 'bg-green-500'  :
    pct >= 60 ? 'bg-blue-500'   :
    pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#1e2535] last:border-0">
      <span className="text-sm text-slate-300 truncate flex-1">{skill.name}</span>
      <div className="w-24 h-1.5 bg-[#1e2535] rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: providers } = useSWR<Provider[]>('providers', () => api.providers.list() as Promise<Provider[]>);
  const { data: tasks }     = useSWR<Task[]>('tasks',         () => api.tasks.list()     as Promise<Task[]>);
  const { data: health, error: healthErr } = useSWR('health', () => api.health.check(), { refreshInterval: 15000 });
  const { data: skills }    = useSWR<Skill[]>('skills',       () => api.autonomous.skills() as Promise<Skill[]>, { refreshInterval: 60000 });
  const { data: autoPending } = useSWR<Task[]>('auto-pending', () => api.autonomous.pendingTasks(5) as Promise<Task[]>, { refreshInterval: 10000 });

  const enabledProviders = providers?.filter(p => p.enabled).length ?? 0;
  const activeTasks      = tasks?.filter(t => t.status === 'in_progress').length ?? 0;
  const completedToday   = tasks?.filter(t => {
    if (!t.completedAt) return false;
    return new Date(t.completedAt).toDateString() === new Date().toDateString();
  }).length ?? 0;

  const skillsBelow = skills?.filter(s => s.level < s.target_level).length ?? 0;
  const avgSkillLevel = skills?.length
    ? Math.round(skills.reduce((s, k) => s + k.level, 0) / skills.length)
    : 0;
  const pendingAutoTasks = autoPending?.length ?? 0;

  const recentTasks = [...(tasks ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const topSkillGaps = [...(skills ?? [])]
    .filter(s => s.level < s.target_level)
    .sort((a, b) => (b.target_level - b.level) - (a.target_level - a.level))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Activity size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Overview</h1>
            <p className="text-xs text-slate-500">AI OS system status</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Health Banner */}
        {healthErr ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            <AlertCircle size={15} />
            Gateway is unreachable — make sure it&apos;s running on port 3000
          </div>
        ) : health ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
            <Activity size={15} />
            All systems operational
          </div>
        ) : null}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={Cpu}         label="AI Providers"      value={enabledProviders}        sub={`of ${providers?.length ?? 0} total`} color="blue" />
          <StatCard icon={Brain}       label="Running Tasks"     value={activeTasks}                                                          color="purple" />
          <StatCard icon={CheckSquare} label="Completed Today"   value={completedToday}                                                       color="green" />
          <StatCard icon={Sparkles}    label="Skill Gaps"        value={skillsBelow}              sub={`avg ${avgSkillLevel}%`}               color="yellow" />
          <StatCard icon={Target}      label="Queued (Auto)"     value={pendingAutoTasks}         sub="autonomous tasks"                       color="orange" />
          <StatCard icon={TrendingUp}  label="Total Skills"      value={skills?.length ?? 0}      sub="tracked"                               color="blue" />
        </div>

        {/* Bottom grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* AI Providers */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu size={14} className="text-blue-400" /> AI Providers
            </h2>
            <div className="space-y-0">
              {!providers?.length && <p className="text-slate-500 text-sm">No providers configured</p>}
              {providers?.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-[#1e2535] last:border-0">
                  <div className="flex items-center gap-2">
                    <Circle
                      size={7}
                      className={p.enabled ? 'fill-green-400 text-green-400' : 'fill-slate-600 text-slate-600'}
                    />
                    <span className="text-sm capitalize text-slate-200">{p.name}</span>
                    {p.modelDefault && <span className="text-xs text-slate-600">{p.modelDefault}</span>}
                  </div>
                  <span className="text-xs text-slate-500">${p.costPer1k}/1k</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Tasks */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <CheckSquare size={14} className="text-green-400" /> Recent Tasks
            </h2>
            <div className="space-y-0">
              {recentTasks.length === 0 && <p className="text-slate-500 text-sm">No tasks yet</p>}
              {recentTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-2.5 border-b border-[#1e2535] last:border-0">
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', STATUS_COLORS[t.status])}>
                    {t.status.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-slate-300 truncate">{t.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Skill Gaps */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Sparkles size={14} className="text-yellow-400" /> Top Skill Gaps
            </h2>
            <div className="space-y-0">
              {topSkillGaps.length === 0 && (
                <p className="text-slate-500 text-sm">All skills at target level</p>
              )}
              {topSkillGaps.map(s => <MiniSkill key={s.id} skill={s} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
