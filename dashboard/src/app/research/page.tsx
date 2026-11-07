'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { MemorySearchResult } from '@/lib/types';
import {
  Rss, Search, RefreshCw, Play, AlertCircle,
  Github, Globe, BookOpen, TrendingUp,
} from 'lucide-react';
import { clsx } from 'clsx';

interface RunResult {
  repos_found: number;
  hn_stories_found: number;
  papers_found: number;
  knowledge_stored: number;
  tasks_created: number;
  errors: string[];
  synthesis_preview: string;
}

function scoreColor(score: number) {
  if (score >= 0.8) return 'text-green-400';
  if (score >= 0.6) return 'text-yellow-400';
  return 'text-slate-500';
}

function SourceIcon({ source }: { source: string }) {
  if (source === 'github_trending') return <Github size={12} className="text-slate-400" />;
  if (source === 'research_pipeline') return <Rss size={12} className="text-blue-400" />;
  return <Globe size={12} className="text-slate-500" />;
}

export default function ResearchPage() {
  const [query, setQuery]   = useState('');
  const [running, setRun]   = useState(false);
  const [runResult, setRes] = useState<RunResult | null>(null);
  const [error, setError]   = useState('');

  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  async function searchMemory() {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const data = await api.memory.search(query, 10) as { results: MemorySearchResult[] };
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function runPipeline() {
    setRun(true);
    setError('');
    setRes(null);
    try {
      const r = await api.autonomous.researchRun() as RunResult;
      setRes(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Pipeline failed');
    } finally {
      setRun(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600/20 border border-green-500/30 flex items-center justify-center">
              <Rss size={16} className="text-green-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Daily Research</h1>
              <p className="text-xs text-slate-500">GitHub Trending · Hacker News · ArXiv · Runs 03:00 UTC</p>
            </div>
          </div>
          <button
            onClick={runPipeline}
            disabled={running}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              running
                ? 'bg-green-600/40 text-green-300/50 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white',
            )}
          >
            {running
              ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
              : <><Play size={14} /> Run Now</>}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Run result */}
        {runResult && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Github,    label: 'Repos',     value: runResult.repos_found },
                { icon: Globe,     label: 'HN Stories', value: runResult.hn_stories_found },
                { icon: BookOpen,  label: 'Papers',    value: runResult.papers_found },
                { icon: TrendingUp, label: 'Stored',   value: runResult.knowledge_stored },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-[#0f1117] rounded-lg border border-[#1e2535] p-3 text-center">
                  <Icon size={16} className="mx-auto text-green-400 mb-1" />
                  <p className="text-xl font-bold text-white">{value}</p>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            {runResult.tasks_created > 0 && (
              <p className="text-sm text-green-400">
                {runResult.tasks_created} new learning task{runResult.tasks_created > 1 ? 's' : ''} created
              </p>
            )}
            {runResult.synthesis_preview && (
              <div className="rounded-lg border border-[#1e2535] bg-[#0f1117] p-4">
                <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">Research Synthesis</p>
                <p className="text-sm text-slate-300 leading-relaxed">{runResult.synthesis_preview}</p>
              </div>
            )}
            {runResult.errors.length > 0 && (
              <div className="flex items-start gap-2 text-amber-400 text-sm">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{runResult.errors.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Knowledge search */}
        <div className="rounded-xl border border-[#1e2535] bg-[#0f1117] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Search Research Knowledge</h2>
          <p className="text-xs text-slate-500">
            Semantic search over all stored research reports, GitHub repos, and ArXiv papers.
          </p>
          <div className="flex gap-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchMemory()}
              placeholder="e.g. LangGraph autonomous agents, Rust async runtime…"
              className="flex-1 bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={searchMemory}
              disabled={!query.trim() || searching}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                !query.trim() || searching
                  ? 'bg-blue-600/40 text-blue-300/50 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white',
              )}
            >
              {searching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              Search
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-3 pt-2">
              {searchResults.map(r => (
                <div
                  key={r.id}
                  className="rounded-lg border border-[#1e2535] bg-[#0a0d14] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                      <SourceIcon source={r.source} />
                      <span className="truncate">{r.topic}</span>
                    </div>
                    <span className={clsx('text-xs font-mono font-bold shrink-0', scoreColor(r.score))}>
                      {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-4">{r.content}</p>
                </div>
              ))}
            </div>
          )}

          {searching && (
            <div className="text-center py-4 text-slate-500 text-sm">Searching…</div>
          )}
          {!searching && query && searchResults.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-sm">
              No results found — try running the pipeline first
            </div>
          )}
        </div>

        {/* Next scheduled run info */}
        <div className="rounded-xl border border-[#1e2535] bg-[#0f1117] p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Schedule</h2>
          <div className="space-y-2 text-sm">
            {[
              { time: '03:00 UTC', job: 'Daily Research Pipeline', desc: 'GitHub Trending + HN + ArXiv' },
              { time: '04:00 UTC', job: 'Skill Learning Cycle',    desc: 'Top 2 skill gaps' },
              { time: '06:00 UTC', job: 'Task Queue Monitor',      desc: 'Check pending tasks' },
              { time: 'Every 15m', job: 'Task Executor',           desc: 'Run up to 3 pending tasks' },
            ].map(({ time, job, desc }) => (
              <div key={job} className="flex items-start gap-4 py-2 border-b border-[#1e2535] last:border-0">
                <span className="text-xs font-mono text-blue-400 w-20 shrink-0 pt-0.5">{time}</span>
                <div>
                  <p className="text-slate-200">{job}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
