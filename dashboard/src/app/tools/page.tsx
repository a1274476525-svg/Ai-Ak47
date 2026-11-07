'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Terminal, Container, Play, RefreshCw, RotateCcw, FileText, Globe, Image as ImageIcon, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';

// ── Terminal Section ──────────────────────────────────────────────────────────

function TerminalSection() {
  const [cmd, setCmd]       = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Array<{ cmd: string; output: string }>>([]);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!cmd.trim() || running) return;
    setRunning(true);
    try {
      await fetch('/api/v1/tools/terminal/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}`,
        },
        body: JSON.stringify({ command: cmd }),
      });
      setOutput('QUEUED');
      setHistory(h => [{ cmd, output: 'Queued for approval' }, ...h.slice(0, 19)]);
    } catch (err: unknown) {
      setOutput(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Terminal size={14} className="text-green-400" /> Sandbox Terminal
        <span className="text-xs text-slate-500 font-normal flex items-center gap-1">
          <ShieldAlert size={11} className="text-yellow-500" /> commands require approval before running
        </span>
      </h2>

      <form onSubmit={handleRun} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2">
          <span className="text-green-400 text-sm font-mono">$</span>
          <input
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            placeholder="python --version"
            className="flex-1 bg-transparent text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={running || !cmd.trim()}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            running || !cmd.trim()
              ? 'bg-green-700/50 text-green-300 cursor-not-allowed'
              : 'bg-green-700 hover:bg-green-600 text-white',
          )}
        >
          {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
          Run
        </button>
      </form>

      {output === 'QUEUED' && (
        <Link href="/approvals" className="block bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400 hover:underline">
          Command queued — review and approve it on the Approvals page →
        </Link>
      )}
      {output !== null && output !== 'QUEUED' && (
        <div className="bg-[#0a0d14] rounded-lg p-4 font-mono text-xs text-green-300 whitespace-pre-wrap max-h-64 overflow-y-auto border border-[#1e2535]">
          {output || '(no output)'}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">History</p>
          {history.map((h, i) => (
            <div key={i} className="border border-[#1e2535] rounded-lg overflow-hidden">
              <button
                onClick={() => setCmd(h.cmd)}
                className="w-full text-left px-3 py-1.5 bg-[#1e2535]/30 hover:bg-[#1e2535] transition-colors"
              >
                <span className="text-green-400 text-xs font-mono">$ {h.cmd}</span>
              </button>
              <div className="px-3 py-1.5 font-mono text-xs text-slate-400 line-clamp-2">
                {h.output || '(empty)'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Docker Section ────────────────────────────────────────────────────────────

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
}

function DockerSection() {
  const { data, isLoading, mutate } = useSWR(
    'docker-containers',
    async () => {
      const res = await fetch('/api/v1/tools/docker/containers', {
        headers: { Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}` },
      });
      const data = await res.json() as { result: string };
      try { return JSON.parse(data.result) as ContainerInfo[]; } catch { return []; }
    },
    { refreshInterval: 15000 },
  );

  const [logs, setLogs]     = useState<{ name: string; content: string } | null>(null);
  const [restarting, setR]  = useState<string | null>(null);

  async function viewLogs(name: string) {
    const res = await fetch(`/api/v1/tools/docker/logs/${name}?lines=100`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}` },
    });
    const data = await res.json() as { logs: string };
    setLogs({ name, content: data.logs });
  }

  const [queuedRestart, setQueuedRestart] = useState(false);

  async function restart(name: string) {
    if (!name.startsWith('aios_')) return;
    setR(name);
    try {
      await fetch(`/api/v1/tools/docker/restart/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}` },
      });
      setQueuedRestart(true);
      setTimeout(() => setQueuedRestart(false), 4000);
    } finally {
      setR(null);
    }
  }

  const isRunning = (status: string) => status.toLowerCase().includes('up');

  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Container size={14} className="text-blue-400" /> Docker Containers
        </h2>
        <button
          onClick={() => mutate()}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {isLoading && <div className="text-slate-500 text-sm">Loading…</div>}
      {queuedRestart && (
        <Link href="/approvals" className="block bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 text-xs text-yellow-400 hover:underline">
          Restart queued — review and approve it on the Approvals page →
        </Link>
      )}

      <div className="space-y-2">
        {(data ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-[#1e2535] last:border-0">
            <div className={clsx('w-2 h-2 rounded-full shrink-0', isRunning(c.status) ? 'bg-green-400' : 'bg-slate-600')} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{c.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{c.image}</p>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:block shrink-0">{c.status}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => viewLogs(c.name)}
                className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                title="View logs"
              >
                <FileText size={12} />
              </button>
              {c.name.startsWith('aios_') && (
                <button
                  onClick={() => restart(c.name)}
                  disabled={restarting === c.name}
                  className="p-1.5 text-slate-500 hover:text-orange-400 hover:bg-orange-400/10 rounded transition-colors disabled:opacity-50"
                  title="Restart"
                >
                  {restarting === c.name
                    ? <RefreshCw size={12} className="animate-spin" />
                    : <RotateCcw size={12} />
                  }
                </button>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (!data || data.length === 0) && (
          <p className="text-sm text-slate-500">No containers found — is Docker running?</p>
        )}
      </div>

      {/* Logs modal */}
      {logs && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2535]">
              <h3 className="text-sm font-semibold">Logs — {logs.name}</h3>
              <button onClick={() => setLogs(null)} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <pre className="flex-1 overflow-y-auto p-4 text-xs text-green-300 font-mono whitespace-pre-wrap">
              {logs.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Browser Section ───────────────────────────────────────────────────────────

function BrowserSection() {
  const [url, setUrl]         = useState('https://example.com');
  const [mode, setMode]       = useState<'navigate' | 'screenshot' | 'links'>('navigate');
  const [result, setResult]   = useState<string | null>(null);
  const [imgSrc, setImgSrc]   = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function authH() {
    return { Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}` };
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || running) return;
    setRunning(true);
    setResult(null);
    setImgSrc(null);
    try {
      if (mode === 'navigate') {
        const res = await fetch('/api/v1/tools/browser/navigate', {
          method: 'POST',
          headers: { ...authH(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json() as { title?: string; text?: string; error?: string };
        setResult(data.error ? `Error: ${data.error}` : `Title: ${data.title}\n\n${data.text}`);
      } else if (mode === 'screenshot') {
        const res = await fetch('/api/v1/tools/browser/screenshot', {
          method: 'POST',
          headers: { ...authH(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json() as { base64?: string; error?: string };
        if (data.error) { setResult(`Error: ${data.error}`); }
        else if (data.base64) { setImgSrc(`data:image/png;base64,${data.base64}`); }
      } else {
        const res  = await fetch(`/api/v1/tools/browser/links?url=${encodeURIComponent(url)}`, {
          headers: authH(),
        });
        const data = await res.json() as { links?: Array<{ text: string; href: string }>; error?: string };
        if (data.links) {
          setResult(data.links.map((l, i) => `${i+1}. [${l.text}](${l.href})`).join('\n'));
        }
      }
    } catch (err: unknown) {
      setResult(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Globe size={14} className="text-blue-400" /> Browser Automation
        <span className="text-xs text-slate-500 font-normal">(Playwright headless Chromium)</span>
      </h2>

      {/* Mode tabs */}
      <div className="flex gap-1">
        {(['navigate', 'screenshot', 'links'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(
              'px-3 py-1 text-xs rounded transition-colors',
              mode === m ? 'bg-blue-600 text-white' : 'bg-[#1e2535] text-slate-400 hover:text-slate-200',
            )}
          >
            {m === 'navigate' ? 'Navigate' : m === 'screenshot' ? 'Screenshot' : 'Links'}
          </button>
        ))}
      </div>

      <form onSubmit={handleRun} className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
        />
        <button
          type="submit"
          disabled={running || !url.trim()}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            running || !url.trim()
              ? 'bg-blue-700/50 text-blue-300 cursor-not-allowed'
              : 'bg-blue-700 hover:bg-blue-600 text-white',
          )}
        >
          {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
          Go
        </button>
      </form>

      {result && (
        <div className="bg-[#0a0d14] rounded-lg p-4 text-xs text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto border border-[#1e2535] font-mono">
          {result}
        </div>
      )}
      {imgSrc && (
        <div className="border border-[#1e2535] rounded-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-[#1e2535]/40 border-b border-[#1e2535]">
            <ImageIcon size={12} className="text-slate-400" />
            <span className="text-xs text-slate-400">Screenshot</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt="Screenshot" className="w-full" />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-600/20 border border-green-500/30 flex items-center justify-center">
            <Terminal size={16} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Tool Integrations</h1>
            <p className="text-xs text-slate-500">Terminal · Docker · Browser · VSCode — Phase 4</p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <TerminalSection />
        <BrowserSection />
        <DockerSection />
      </div>
    </div>
  );
}
