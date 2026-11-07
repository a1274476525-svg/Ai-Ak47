'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Puzzle, RefreshCw, Wrench, Bot, Route } from 'lucide-react';
import { clsx } from 'clsx';

interface ExtensionInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  tools: string[];
  agents: string[];
  has_router: boolean;
}

export default function ExtensionsPage() {
  const { data, isLoading, mutate } = useSWR<{ extensions: ExtensionInfo[] }>(
    'extensions-list',
    () => api.extensions.list() as Promise<{ extensions: ExtensionInfo[] }>,
  );
  const [reloading, setReloading] = useState(false);

  async function reload() {
    setReloading(true);
    try {
      await api.extensions.reload();
      await mutate();
    } finally {
      setReloading(false);
    }
  }

  const extensions = data?.extensions ?? [];

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Puzzle size={16} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Extensions</h1>
              <p className="text-xs text-slate-500">Plugin SDK — tools, agents & routes loaded from EXTENSIONS_DIR</p>
            </div>
          </div>
          <button
            onClick={reload}
            disabled={reloading}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              reloading ? 'bg-violet-700/50 text-violet-300 cursor-not-allowed' : 'bg-violet-700 hover:bg-violet-600 text-white',
            )}
          >
            <RefreshCw size={13} className={reloading ? 'animate-spin' : ''} />
            Reload
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

        {!isLoading && extensions.length === 0 && (
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-8 text-center">
            <Puzzle size={24} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No extensions loaded.</p>
            <p className="text-xs text-slate-500 mt-1">
              Drop a <code className="text-slate-400">BaseExtension</code> subclass into the <code className="text-slate-400">EXTENSIONS_DIR</code> and click Reload.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {extensions.map(ext => (
            <div key={ext.name} className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">{ext.name}</h2>
                  <p className="text-[11px] text-slate-500">v{ext.version} · {ext.author}</p>
                </div>
                {ext.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap justify-end">
                    {ext.tags.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e2535] text-slate-400">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400">{ext.description}</p>
              <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1 border-t border-[#1e2535]">
                <span className="flex items-center gap-1"><Wrench size={11} /> {ext.tools.length} tools</span>
                <span className="flex items-center gap-1"><Bot size={11} /> {ext.agents.length} agents</span>
                <span className="flex items-center gap-1"><Route size={11} /> {ext.has_router ? 'has routes' : 'no routes'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
