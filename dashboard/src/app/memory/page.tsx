'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Search, Database, Plus, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface MemoryResult {
  id: string;
  score: number;
  content: string;
  topic: string;
  source: string;
}

interface StoreForm { content: string; topic: string; source: string; }

export default function MemoryPage() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<MemoryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [form, setForm]         = useState<StoreForm>({ content: '', topic: '', source: 'manual' });
  const [storing, setStoring]   = useState(false);
  const [storeMsg, setStoreMsg] = useState('');

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const data = await api.memory.search(query, 10) as { results: MemoryResult[]; total: number };
      setResults(data.results);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  async function store(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim() || !form.topic.trim()) return;
    setStoring(true);
    try {
      await api.memory.store(form);
      setStoreMsg('Stored successfully!');
      setForm({ content: '', topic: '', source: 'manual' });
      setTimeout(() => { setStoreMsg(''); setShowStore(false); }, 2000);
    } catch (err) {
      setStoreMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setStoring(false);
    }
  }

  function scoreColor(score: number) {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-yellow-400';
    return 'text-slate-400';
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Memory</h1>
          <p className="text-slate-400 text-sm mt-1">Semantic search across the AI OS knowledge base</p>
        </div>
        <button
          onClick={() => setShowStore(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Store Knowledge
        </button>
      </div>

      {/* Search */}
      <form onSubmit={search} className="flex gap-3 mb-8">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search knowledge base… (e.g. 'NestJS authentication', 'Python async patterns')"
            className="w-full bg-[#0f1117] border border-[#1e2535] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </form>

      {/* Results */}
      {searched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Database size={32} className="text-slate-700 mb-3" />
          <p className="text-slate-400">No results found for &quot;{query}&quot;</p>
          <p className="text-slate-600 text-sm mt-1">Try different keywords or store new knowledge first</p>
        </div>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={r.id} className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">#{i + 1}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">{r.topic}</span>
                <span className="text-xs text-slate-600">{r.source}</span>
              </div>
              <span className={clsx('text-xs font-mono font-medium', scoreColor(r.score))}>
                {(r.score * 100).toFixed(1)}% match
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed line-clamp-4 whitespace-pre-wrap">
              {r.content}
            </p>
          </div>
        ))}
      </div>

      {/* Store Modal */}
      {showStore && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
              <h2 className="text-sm font-semibold text-white">Store Knowledge</h2>
              <button onClick={() => setShowStore(false)} className="text-slate-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={store} className="p-6 space-y-4">
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Topic *</span>
                <input
                  required value={form.topic}
                  onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g. NestJS Guards, Python asyncio, Docker networking"
                  className="w-full bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Content *</span>
                <textarea
                  required rows={5} value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Knowledge content to store…"
                  className="w-full bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Source</span>
                <input
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  placeholder="manual, docs, github, stackoverflow…"
                  className="w-full bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </label>
              {storeMsg && (
                <p className={clsx('text-xs', storeMsg.includes('success') ? 'text-green-400' : 'text-red-400')}>
                  {storeMsg}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={storing} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                  {storing ? 'Storing…' : 'Store'}
                </button>
                <button type="button" onClick={() => setShowStore(false)} className="flex-1 bg-[#161b27] hover:bg-[#1e2535] text-slate-300 text-sm py-2 rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
