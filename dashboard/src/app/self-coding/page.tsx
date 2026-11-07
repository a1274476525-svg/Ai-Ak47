'use client';

import { useState, useEffect, useRef } from 'react';
import { RotateCcw, Play, CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp, Code2 } from 'lucide-react';
import { clsx } from 'clsx';

const API_RUN    = '/api/v1/autonomous/coding-loop/run';
const API_STATUS = (id: string) => `/api/v1/autonomous/coding-loop/${id}`;
const API_LIST   = '/api/v1/autonomous/coding-loop';

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}` };
}

const LANGUAGES = ['python', 'javascript', 'typescript'];

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    running:        { icon: <Loader2 size={11} className="animate-spin" />, cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', label: 'Running' },
    passed:         { icon: <CheckCircle2 size={11} />, cls: 'text-green-400 bg-green-400/10 border-green-400/20', label: 'Passed' },
    failed:         { icon: <XCircle size={11} />,      cls: 'text-red-400 bg-red-400/10 border-red-400/20',       label: 'Failed' },
    max_iterations: { icon: <Clock size={11} />,        cls: 'text-orange-400 bg-orange-400/10 border-orange-400/20', label: 'Max iters' },
  };
  const s = map[status] ?? { icon: null, cls: 'text-slate-400 bg-slate-400/10 border-slate-400/20', label: status };
  return (
    <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border', s.cls)}>
      {s.icon}{s.label}
    </span>
  );
}

// ── Run card ───────────────────────────────────────────────────────────────────

interface Run {
  run_id:        string;
  task:          string;
  language:      string;
  status:        string;
  iterations:    number;
  final_code:    string;
  final_tests:   string;
  last_output:   string;
  started_at:    string;
  finished_at:   string;
  history:       Array<{ iteration: number; passed: boolean; error_summary: string }>;
}

function RunCard({ run, onRefresh }: { run: Run; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab]           = useState<'code' | 'tests' | 'output'>('output');

  return (
    <div className={clsx(
      'border rounded-xl overflow-hidden transition-colors',
      run.status === 'passed'  ? 'border-green-500/30' :
      run.status === 'running' ? 'border-yellow-500/30' :
      run.status === 'failed'  ? 'border-red-500/30'   : 'border-[#1e2535]',
    )}>
      {/* Summary row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 bg-[#0f1117] hover:bg-[#1e2535]/40 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={run.status} />
            <span className="text-[10px] text-slate-500 font-mono">{run.run_id}</span>
            <span className="text-[10px] text-slate-500">iter {run.iterations}</span>
            <span className="text-[10px] text-slate-500 px-1.5 py-0.5 bg-[#1e2535] rounded">{run.language}</span>
          </div>
          <p className="text-sm text-slate-200 mt-1.5 line-clamp-1">{run.task}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {run.status === 'running' && (
            <button
              onClick={e => { e.stopPropagation(); onRefresh(); }}
              className="text-slate-500 hover:text-slate-300"
            >
              <RotateCcw size={12} />
            </button>
          )}
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#1e2535]">
          {/* Iteration history */}
          {run.history.length > 0 && (
            <div className="px-4 py-2 flex gap-2 flex-wrap border-b border-[#1e2535]">
              {run.history.map(h => (
                <div
                  key={h.iteration}
                  className={clsx(
                    'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded',
                    h.passed ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400',
                  )}
                >
                  {h.passed ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                  Iter {h.iteration}
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-[#1e2535]">
            {(['output', 'code', 'tests'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-4 py-2 text-xs font-medium transition-colors',
                  tab === t ? 'text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {t === 'output' ? 'Test Output' : t === 'code' ? 'Final Code' : 'Tests'}
              </button>
            ))}
          </div>

          <pre className="p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-80 overflow-y-auto bg-[#0a0d14]">
            {tab === 'output' ? (run.last_output   || '(no output)') :
             tab === 'code'   ? (run.final_code    || '(no code yet)') :
                                (run.final_tests   || '(no tests yet)')}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SelfCodingPage() {
  const [task, setTask]       = useState('');
  const [lang, setLang]       = useState('python');
  const [maxIter, setMaxIter] = useState(5);
  const [submitting, setSub]  = useState(false);
  const [runs, setRuns]       = useState<Run[]>([]);
  const [error, setError]     = useState('');
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchRuns() {
    try {
      const res  = await fetch(`${API_LIST}?limit=20`, { headers: authHeader() });
      const data = await res.json() as { runs: Run[] };
      setRuns(data.runs ?? []);
    } catch { /* ignore */ }
  }

  async function refreshRun(runId: string) {
    try {
      const res  = await fetch(API_STATUS(runId), { headers: authHeader() });
      const data = await res.json() as Run;
      setRuns(prev => prev.map(r => r.run_id === runId ? data : r));
    } catch { /* ignore */ }
  }

  // Poll running tasks every 5s
  useEffect(() => {
    fetchRuns();
    pollRef.current = setInterval(() => {
      fetchRuns();
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function startLoop(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim() || submitting) return;
    setSub(true);
    setError('');
    try {
      const res  = await fetch(API_RUN, {
        method:  'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ task: task.trim(), language: lang, max_iterations: maxIter }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string };
        throw new Error(err.detail ?? 'Start failed');
      }
      await res.json();
      setTask('');
      fetchRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSub(false);
    }
  }

  const hasRunning = runs.some(r => r.status === 'running');

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
            <Code2 size={16} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Self-Coding Loop</h1>
            <p className="text-xs text-slate-500">
              Autonomous write → test → fix cycle · Phase 4
            </p>
          </div>
          {hasRunning && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-yellow-400">
              <Loader2 size={12} className="animate-spin" /> Loop running…
            </span>
          )}
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* New task form */}
        <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">Start a new coding loop</h2>

          <form onSubmit={startLoop} className="space-y-3">
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Describe what to build, e.g.: 'Write a Python function that converts CSV to JSON with header row support, plus pytest tests'"
              rows={3}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 resize-none"
            />

            <div className="flex items-center gap-3 flex-wrap">
              {/* Language */}
              <select
                value={lang}
                onChange={e => setLang(e.target.value)}
                className="bg-[#1e2535] border border-[#2a3548] text-sm text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>

              {/* Max iterations */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Max iterations:</span>
                {[3, 5, 8, 10].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxIter(n)}
                    className={clsx(
                      'w-8 h-7 text-xs rounded transition-colors',
                      maxIter === n
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#1e2535] text-slate-400 hover:bg-[#2a3548]',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={submitting || !task.trim()}
                className={clsx(
                  'ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  submitting || !task.trim()
                    ? 'bg-purple-700/50 text-purple-300 cursor-not-allowed'
                    : 'bg-purple-700 hover:bg-purple-600 text-white',
                )}
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                Start Loop
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
            )}
          </form>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { step: '1', label: 'Generate', desc: 'Coding Brain writes code + pytest tests' },
            { step: '2', label: 'Execute',  desc: 'Runs tests in sandbox container' },
            { step: '3', label: 'Analyze',  desc: 'Extracts failures and error context' },
            { step: '4', label: 'Fix',      desc: 'Loops back until tests pass' },
          ].map(s => (
            <div key={s.step} className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-3 text-center">
              <div className="w-6 h-6 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-400 mx-auto mb-2">
                {s.step}
              </div>
              <p className="text-xs font-semibold text-slate-200">{s.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Runs list */}
        {runs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Recent runs</h2>
              <button
                onClick={fetchRuns}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <RotateCcw size={11} /> Refresh
              </button>
            </div>
            {runs.map(run => (
              <RunCard key={run.run_id} run={run} onRefresh={() => refreshRun(run.run_id)} />
            ))}
          </div>
        )}

        {runs.length === 0 && (
          <p className="text-center text-slate-600 text-sm py-8">
            No loops yet — start one above.
          </p>
        )}
      </div>
    </div>
  );
}
