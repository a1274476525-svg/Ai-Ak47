'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { CodingBrainResult, TaskStep } from '@/lib/types';
import { Brain, Code, Send, RefreshCw, ChevronDown, ChevronUp, CheckSquare, ListOrdered } from 'lucide-react';
import { clsx } from 'clsx';

const TASK_TYPES = [
  { value: 'default',    label: 'Auto-detect',  desc: 'AI decides which agents to use' },
  { value: 'full_stack', label: 'Full Stack',    desc: '8 agents — complete system' },
  { value: 'backend',    label: 'Backend',       desc: 'API + DB + DevOps + QA' },
  { value: 'frontend',   label: 'Frontend',      desc: 'UI + Security + QA' },
  { value: 'api',        label: 'API Design',    desc: 'Architecture + Backend + DB + Security' },
  { value: 'database',   label: 'Database',      desc: 'Schema + queries + migrations' },
  { value: 'devops',     label: 'DevOps',        desc: 'Docker + CI/CD + monitoring' },
  { value: 'audit',      label: 'Audit',         desc: 'Security + QA + Docs only' },
];

const AGENT_COLORS: Record<string, string> = {
  architecture: 'text-blue-400 bg-blue-400/10',
  backend:      'text-green-400 bg-green-400/10',
  frontend:     'text-purple-400 bg-purple-400/10',
  database:     'text-yellow-400 bg-yellow-400/10',
  devops:       'text-orange-400 bg-orange-400/10',
  security:     'text-red-400 bg-red-400/10',
  qa:           'text-cyan-400 bg-cyan-400/10',
  docs:         'text-slate-300 bg-slate-400/10',
};

function SubResultPanel({ agent, content }: { agent: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#1e2535] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1e2535]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={clsx('text-[10px] px-2 py-0.5 rounded font-medium uppercase', AGENT_COLORS[agent] ?? 'text-slate-400 bg-slate-400/10')}>
            {agent}
          </span>
          <span className="text-xs text-slate-400">{content.length} chars</span>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[#1e2535]">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed mt-3 max-h-96 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function CodingBrainPage() {
  const [task, setTask]         = useState('');
  const [taskType, setTaskType] = useState('default');
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState<CodingBrainResult | null>(null);
  const [steps, setSteps]       = useState<TaskStep[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [showSubs, setShowSubs] = useState(false);
  const [showTrace, setShowTrace] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim() || running) return;
    setRunning(true);
    setResult(null);
    setSteps([]);
    setError(null);

    try {
      const res = await api.autonomous.codingBrain({ task, task_type: taskType }) as CodingBrainResult;
      setResult(res);
      if (res.task_id) {
        try {
          setSteps(await api.autonomous.taskSteps(res.task_id) as TaskStep[]);
        } catch {
          setSteps([]);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Brain size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Coding Brain</h1>
            <p className="text-xs text-slate-500">8 specialized agents — Architecture · Backend · Frontend · DB · DevOps · Security · QA · Docs</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Input form */}
        <form onSubmit={handleSubmit} className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Describe your software task</label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Build a REST API for a task management system with PostgreSQL, JWT auth, and real-time updates via WebSockets..."
              rows={5}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-2 block">Task type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TASK_TYPES.map(tt => (
                <button
                  key={tt.value}
                  type="button"
                  onClick={() => setTaskType(tt.value)}
                  className={clsx(
                    'text-left p-2.5 rounded-lg border text-xs transition-colors',
                    taskType === tt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                      : 'border-[#1e2535] text-slate-400 hover:border-[#2e3545]',
                  )}
                >
                  <p className="font-medium text-[11px]">{tt.label}</p>
                  <p className="text-[10px] opacity-60 mt-0.5">{tt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={running || !task.trim()}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-sm transition-colors',
              running || !task.trim()
                ? 'bg-blue-600/50 text-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white',
            )}
          >
            {running ? (
              <><RefreshCw size={15} className="animate-spin" /> Running 8 agents… (may take 1-2 min)</>
            ) : (
              <><Send size={15} /> Launch Coding Brain</>
            )}
          </button>
        </form>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            {/* Agents used + token stats */}
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <CheckSquare size={14} className="text-green-400" />
                  <span className="text-xs text-slate-400">{result.agents_used.length} agents ran</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.agents_used.map(a => (
                    <span key={a} className={clsx('text-[10px] px-2 py-0.5 rounded font-medium uppercase', AGENT_COLORS[a] ?? 'text-slate-400 bg-slate-400/10')}>
                      {a}
                    </span>
                  ))}
                </div>
                <div className="ml-auto text-xs text-slate-500">
                  {(result.tokens_in + result.tokens_out).toLocaleString()} tokens
                </div>
              </div>
            </div>

            {/* Execution trace */}
            {steps.length > 0 && (
              <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-3">
                <button
                  onClick={() => setShowTrace(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold w-full"
                >
                  <ListOrdered size={14} className="text-slate-400" />
                  Execution trace ({steps.length} steps)
                  {showTrace ? <ChevronUp size={14} className="ml-auto text-slate-500" /> : <ChevronDown size={14} className="ml-auto text-slate-500" />}
                </button>
                {showTrace && (
                  <div className="space-y-2 pt-1">
                    {steps.map(s => (
                      <div key={s.id} className="flex items-start gap-3 text-xs">
                        <span className="w-5 shrink-0 text-slate-600 tabular-nums">{s.step_index}</span>
                        <span className={clsx('shrink-0 px-1.5 py-0.5 rounded font-medium uppercase text-[10px]', AGENT_COLORS[s.agent ?? ''] ?? 'text-slate-400 bg-slate-400/10')}>
                          {s.agent}
                        </span>
                        <span className="text-slate-500 truncate flex-1">{s.message}</span>
                        <span className="text-slate-600 shrink-0">{new Date(s.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Synthesis */}
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Code size={14} className="text-blue-400" />
                <h2 className="text-sm font-semibold">Synthesis</h2>
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans leading-relaxed">
                  {result.content}
                </pre>
              </div>
            </div>

            {/* Sub-agent outputs */}
            {result.sub_results.length > 0 && (
              <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-3">
                <button
                  onClick={() => setShowSubs(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold w-full"
                >
                  <Brain size={14} className="text-slate-400" />
                  Sub-agent outputs ({result.sub_results.length})
                  {showSubs ? <ChevronUp size={14} className="ml-auto text-slate-500" /> : <ChevronDown size={14} className="ml-auto text-slate-500" />}
                </button>
                {showSubs && (
                  <div className="space-y-2 pt-2">
                    {result.sub_results.map((sr, i) => (
                      <SubResultPanel key={i} agent={sr.agent} content={sr.content} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Intro when no result */}
        {!result && !running && (
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">How the Coding Brain works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: '🏗️', title: 'Architecture', desc: 'System design, component diagram, tech choices' },
                { icon: '⚙️', title: 'Backend + DB', desc: 'API implementation, schemas, migrations' },
                { icon: '🎨', title: 'Frontend', desc: 'React/Next.js UI components and pages' },
                { icon: '🚀', title: 'DevOps', desc: 'Docker, CI/CD, Kubernetes, monitoring' },
                { icon: '🔒', title: 'Security', desc: 'OWASP audit, vulnerability analysis' },
                { icon: '🧪', title: 'QA', desc: 'Unit, integration, and E2E tests' },
                { icon: '📝', title: 'Docs', desc: 'README, API reference, ADRs' },
                { icon: '🧠', title: 'Synthesis', desc: 'Final cohesive output from all agents' },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3 p-3 border border-[#1e2535] rounded-lg">
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <p className="text-xs font-medium text-slate-300">{item.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
