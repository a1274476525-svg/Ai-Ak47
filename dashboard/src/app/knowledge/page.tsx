'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { KnowledgeConcept, KnowledgeGraphStats } from '@/lib/types';
import { Network, Search, Plus, GitBranch, Layers, AlertCircle, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

const LABEL_COLORS: Record<string, string> = {
  Concept: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  Entity:  'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  Skill:   'bg-green-500/15 text-green-400 border border-green-500/20',
  Task:    'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  Insight: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
};

function NodeBadge({ label }: { label: string }) {
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', LABEL_COLORS[label] ?? 'bg-slate-700/50 text-slate-400 border border-slate-600/20')}>
      {label}
    </span>
  );
}

export default function KnowledgePage() {
  const { data: stats, isLoading: statsLoading } = useSWR<KnowledgeGraphStats>(
    'kg-stats',
    () => api.knowledge.stats() as Promise<KnowledgeGraphStats>,
    { refreshInterval: 30000 },
  );

  const [searchQ, setSearchQ]       = useState('');
  const [searchRes, setSearchRes]   = useState<KnowledgeConcept[]>([]);
  const [searching, setSearching]   = useState(false);
  const [related, setRelated]       = useState<Array<{ label: string; name: string; description: string }>>([]);
  const [selectedConcept, setSelected] = useState<string | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Add concept form
  const [newName, setNewName]   = useState('');
  const [newCat, setNewCat]     = useState('general');
  const [newDesc, setNewDesc]   = useState('');
  const [adding, setAdding]     = useState(false);
  const [addMsg, setAddMsg]     = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const results = await api.knowledge.searchConcepts(searchQ, 15) as KnowledgeConcept[];
      setSearchRes(results);
    } finally {
      setSearching(false);
    }
  }

  async function loadRelated(name: string) {
    setSelected(name);
    setLoadingRelated(true);
    try {
      const res = await api.knowledge.getRelated(name, 'Concept', 2) as Array<{ label: string; name: string; description: string }>;
      setRelated(res);
    } finally {
      setLoadingRelated(false);
    }
  }

  async function handleAddConcept(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setAddMsg(null);
    try {
      await api.knowledge.upsertConcept({ name: newName, category: newCat, description: newDesc });
      setAddMsg(`Added: "${newName}"`);
      setNewName(''); setNewDesc('');
    } catch (err: unknown) {
      setAddMsg(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setAdding(false);
    }
  }

  const available = stats?.available ?? false;
  const nodeTotal = stats?.nodes ? Object.values(stats.nodes).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
            <Network size={16} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Knowledge Graph</h1>
            <p className="text-xs text-slate-500">Neo4j — structured long-term memory</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Status + Stats */}
        {statsLoading ? (
          <div className="text-slate-500 text-sm">Loading graph stats…</div>
        ) : !available ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-sm">
            <AlertCircle size={15} />
            Knowledge Graph unavailable — Neo4j may not be running. Start it with <code className="bg-yellow-500/10 px-1 rounded">docker compose up neo4j</code>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{nodeTotal}</p>
              <p className="text-xs text-slate-500 mt-1">Total nodes</p>
            </div>
            <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{stats?.relationships ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">Relationships</p>
            </div>
            {Object.entries(stats?.nodes ?? {}).map(([label, count]) => (
              <div key={label} className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{count}</p>
                <p className="text-xs text-slate-500 mt-1">{label} nodes</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Search */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Search size={14} className="text-blue-400" /> Search Concepts
            </h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="e.g. LangGraph, Neo4j, FastAPI..."
                className="flex-1 bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {searching ? <RefreshCw size={14} className="animate-spin" /> : 'Search'}
              </button>
            </form>
            <div className="space-y-2">
              {searchRes.map(c => (
                <button
                  key={c.name}
                  onClick={() => loadRelated(c.name)}
                  className={clsx(
                    'w-full text-left rounded-lg border p-3 transition-colors',
                    selectedConcept === c.name
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-[#1e2535] hover:border-[#2e3545]',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-white font-medium">{c.name}</span>
                    <NodeBadge label="Concept" />
                    <span className="text-[10px] text-slate-500">{c.category}</span>
                  </div>
                  {c.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">{c.description}</p>
                  )}
                </button>
              ))}
              {searchRes.length === 0 && searchQ && !searching && (
                <p className="text-sm text-slate-500">No concepts found for &quot;{searchQ}&quot;</p>
              )}
            </div>
          </div>

          {/* Related nodes */}
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <GitBranch size={14} className="text-green-400" />
              {selectedConcept ? `Related to "${selectedConcept}"` : 'Select a concept to explore'}
            </h2>
            {loadingRelated && <div className="text-slate-500 text-sm">Loading…</div>}
            <div className="space-y-2">
              {related.map((r, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-[#1e2535] last:border-0">
                  <NodeBadge label={r.label} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.name}</p>
                    {r.description && (
                      <p className="text-xs text-slate-500 line-clamp-1">{r.description}</p>
                    )}
                  </div>
                </div>
              ))}
              {related.length === 0 && selectedConcept && !loadingRelated && (
                <p className="text-sm text-slate-500">No related nodes found in graph</p>
              )}
            </div>
          </div>
        </div>

        {/* Add concept */}
        <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Plus size={14} className="text-orange-400" /> Add Concept
          </h2>
          <form onSubmit={handleAddConcept} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Concept name *"
              className="bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500"
            />
            <select
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              className="bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
            >
              {['general', 'technology', 'pattern', 'insight', 'tool', 'framework', 'language'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="sm:col-span-3 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {adding ? 'Adding…' : 'Add to Knowledge Graph'}
            </button>
          </form>
          {addMsg && (
            <p className="text-sm text-green-400">{addMsg}</p>
          )}
        </div>

        {/* Node type legend */}
        <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Layers size={14} className="text-slate-400" /> Node Types
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Concept', desc: 'Abstract ideas, technologies, topics' },
              { label: 'Entity', desc: 'Concrete things: projects, libraries, people' },
              { label: 'Skill', desc: 'Tracked knowledge domains' },
              { label: 'Task', desc: 'Executed autonomous tasks' },
              { label: 'Insight', desc: 'Derived observations and lessons' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center gap-2">
                <NodeBadge label={label} />
                <span className="text-xs text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
