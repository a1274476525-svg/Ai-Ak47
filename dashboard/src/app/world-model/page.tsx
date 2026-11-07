'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { WorldModelStats } from '@/lib/types';
import { Globe, Search, BookOpen, RefreshCw, Database, GitBranch, Layers } from 'lucide-react';

export default function WorldModelPage() {
  const { data: stats, isLoading, mutate } = useSWR<WorldModelStats>(
    'wm-stats',
    () => api.autonomous.worldModelStats() as Promise<WorldModelStats>,
    { refreshInterval: 60000 },
  );

  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Array<{ content: string; score: number; source: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState<string | null>(null);

  // Manual learn form
  const [topic, setTopic]       = useState('');
  const [summary, setSummary]   = useState('');
  const [learning, setLearning] = useState(false);
  const [learnMsg, setLearnMsg] = useState<string | null>(null);

  async function handleRecall(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.autonomous.worldModelRecall({ query, limit: 10 }) as Array<{ content: string; score: number; source: string }>;
      setResults(res);
    } finally {
      setSearching(false);
    }
  }

  async function handleLearn(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !summary.trim()) return;
    setLearning(true);
    setLearnMsg(null);
    try {
      await api.autonomous.worldModelLearn({ topic, summary });
      setLearnMsg(`Stored: "${topic}"`);
      setTopic(''); setSummary('');
      mutate();
    } catch (err: unknown) {
      setLearnMsg(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setLearning(false);
    }
  }

  async function handleConsolidate() {
    setConsolidating(true);
    setConsolidateMsg(null);
    try {
      const res = await api.autonomous.worldModelConsolidate(50) as { consolidated: number };
      setConsolidateMsg(`Consolidated ${res.consolidated} items`);
      mutate();
    } catch (err: unknown) {
      setConsolidateMsg(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setConsolidating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-600/20 border border-teal-500/30 flex items-center justify-center">
              <Globe size={16} className="text-teal-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">World Model</h1>
              <p className="text-xs text-slate-500">Accumulated AI OS knowledge — Qdrant + Neo4j</p>
            </div>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={consolidating}
            className="flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {consolidating
              ? <><RefreshCw size={14} className="animate-spin" /> Consolidating…</>
              : <><Layers size={14} /> Consolidate</>
            }
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {consolidateMsg && (
          <div className="text-sm text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3">
            {consolidateMsg}
          </div>
        )}

        {/* Stats */}
        {isLoading ? (
          <div className="text-slate-500 text-sm">Loading stats…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 text-center">
              <Database size={18} className="text-teal-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.knowledge_graph_nodes ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">Graph nodes</p>
            </div>
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 text-center">
              <GitBranch size={18} className="text-purple-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.knowledge_graph_edges ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">Relationships</p>
            </div>
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 text-center col-span-2">
              <p className="text-xs text-slate-500 mb-1">Last updated</p>
              <p className="text-sm text-white">
                {stats?.last_updated
                  ? new Date(stats.last_updated).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recall / Search */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Search size={14} className="text-blue-400" /> Recall from World Model
            </h2>
            <form onSubmit={handleRecall} className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="What do you remember about…"
                className="flex-1 bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {searching ? <RefreshCw size={14} className="animate-spin" /> : 'Recall'}
              </button>
            </form>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="border border-[#1e2535] rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{r.source}</span>
                    <span className="text-[10px] text-teal-400">score: {r.score.toFixed(3)}</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{r.content}</p>
                </div>
              ))}
              {results.length === 0 && query && !searching && (
                <p className="text-sm text-slate-500">No memories found for this query</p>
              )}
            </div>
          </div>

          {/* Manual learning */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen size={14} className="text-green-400" /> Teach the World Model
            </h2>
            <form onSubmit={handleLearn} className="space-y-3">
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Topic / technology name *"
                className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-green-500"
              />
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Summary of what you've learned about this topic *"
                rows={5}
                className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-green-500 resize-none"
              />
              <button
                type="submit"
                disabled={learning || !topic.trim() || !summary.trim()}
                className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {learning ? 'Storing…' : 'Store in World Model'}
              </button>
            </form>
            {learnMsg && (
              <p className="text-sm text-green-400">{learnMsg}</p>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">How the World Model grows</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-500">
            <div>
              <p className="text-slate-300 font-medium mb-1">Automatic sources</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Task results (every execution)</li>
                <li>Daily research pipeline (GitHub + HN + ArXiv)</li>
                <li>Skill learning cycles</li>
                <li>Self-evaluation insights</li>
              </ul>
            </div>
            <div>
              <p className="text-slate-300 font-medium mb-1">Storage layers</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Qdrant — semantic vector search</li>
                <li>Neo4j — graph relationships</li>
                <li>PostgreSQL — structured metadata</li>
              </ul>
            </div>
            <div>
              <p className="text-slate-300 font-medium mb-1">Consolidation</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Runs daily at 02:00 UTC</li>
                <li>Merges related facts</li>
                <li>Strengthens graph connections</li>
                <li>Can be triggered manually above</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
