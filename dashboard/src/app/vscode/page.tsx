'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Code2, FolderOpen, FileText, RefreshCw, Save, Trash2, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

const API = (path: string) => `/api/v1/tools${path}`;

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('aios_token') ?? ''}` };
}

// ── File Explorer ──────────────────────────────────────────────────────────────

interface FileEntry {
  type: 'DIR' | 'FILE';
  path: string;
  name: string;
}

function parseListingEntry(line: string): FileEntry | null {
  const m = line.match(/^\[(DIR|FILE)\]\s+(.+)$/);
  if (!m) return null;
  const path = m[2].trim();
  const parts = path.split('/');
  return { type: m[1] as 'DIR' | 'FILE', path, name: parts[parts.length - 1] };
}

function FileExplorer({
  onSelect,
  selected,
}: {
  onSelect: (path: string) => void;
  selected: string;
}) {
  const [listing, setListing] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dir, setDir]         = useState('.');

  async function load(directory: string) {
    setLoading(true);
    try {
      const res  = await fetch(API(`/vscode/files?directory=${encodeURIComponent(directory)}`), {
        headers: authHeader(),
      });
      const data = await res.json() as { listing: string };
      const lines = (data.listing ?? '').split('\n').filter(Boolean);
      setListing(lines.map(parseListingEntry).filter(Boolean) as FileEntry[]);
      setDir(directory);
    } catch {
      setListing([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load('.'); }, []);

  return (
    <div className="w-56 shrink-0 border-r border-[#1e2535] bg-[#0f1117] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e2535]">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Explorer</span>
        <button onClick={() => load(dir)} className="text-slate-500 hover:text-slate-300">
          <RefreshCw size={11} />
        </button>
      </div>
      {dir !== '.' && (
        <button
          onClick={() => {
            const parent = dir.includes('/') ? dir.split('/').slice(0, -1).join('/') : '.';
            load(parent);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-[#1e2535]/40 text-left"
        >
          <ChevronRight size={10} className="rotate-180" /> ..
        </button>
      )}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && <p className="text-xs text-slate-600 px-3 py-2">Loading…</p>}
        {!loading && listing.length === 0 && (
          <p className="text-xs text-slate-600 px-3 py-2">Empty workspace</p>
        )}
        {listing.map(entry => (
          <button
            key={entry.path}
            onClick={() => entry.type === 'DIR' ? load(entry.path) : onSelect(entry.path)}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
              entry.type === 'FILE' && selected === entry.path
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-slate-300 hover:bg-[#1e2535]/60',
            )}
          >
            {entry.type === 'DIR'
              ? <FolderOpen size={12} className="text-yellow-400 shrink-0" />
              : <FileText  size={12} className="text-slate-400 shrink-0" />
            }
            <span className="truncate">{entry.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Editor Panel ───────────────────────────────────────────────────────────────

function EditorPanel({ path }: { path: string }) {
  const [content, setContent]   = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    fetch(API(`/vscode/read?path=${encodeURIComponent(path)}`), { headers: authHeader() })
      .then(r => r.json())
      .then((d: { content: string }) => {
        setContent(d.content ?? '');
        setOriginal(d.content ?? '');
      })
      .catch(() => setContent('Error loading file'))
      .finally(() => setLoading(false));
  }, [path]);

  async function save() {
    if (!path || saving) return;
    setSaving(true);
    try {
      await fetch(API('/vscode/write'), {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      setMsg('Queued for approval →');
      setTimeout(() => setMsg(''), 4000);
    } catch {
      setMsg('Error queuing write');
    } finally {
      setSaving(false);
    }
  }

  async function deleteFile() {
    if (!path || !confirm(`Queue delete of ${path} for approval?`)) return;
    await fetch(API(`/vscode/delete?path=${encodeURIComponent(path)}`), {
      method: 'DELETE',
      headers: authHeader(),
    });
    setMsg('Delete queued for approval →');
  }

  const dirty = content !== original;

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2535] bg-[#0f1117]">
        <span className="text-xs text-slate-400 font-mono">{path}{dirty ? ' •' : ''}</span>
        <div className="flex items-center gap-2">
          {msg && (
            msg.includes('approval')
              ? <Link href="/approvals" className="text-xs text-yellow-400 hover:underline">{msg}</Link>
              : <span className="text-xs text-red-400">{msg}</span>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded transition-colors text-white"
          >
            {saving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
            Save
          </button>
          <button
            onClick={deleteFile}
            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
            title="Delete file"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 bg-[#0a0d14] text-sm text-slate-200 font-mono p-4 resize-none focus:outline-none leading-relaxed"
          spellCheck={false}
        />
      )}
    </div>
  );
}

// ── New File Form ──────────────────────────────────────────────────────────────

function NewFileForm() {
  const [path, setPath]       = useState('');
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const [queued, setQueued]   = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim() || saving) return;
    setSaving(true);
    try {
      await fetch(API('/vscode/write'), {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.trim(), content: '' }),
      });
      setQueued(true);
      setPath('');
      setTimeout(() => { setQueued(false); setOpen(false); }, 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-blue-400 transition-colors px-3 py-2 border-t border-[#1e2535] w-full text-left"
      >
        + New file
      </button>
    );
  }

  if (queued) {
    return (
      <Link href="/approvals" className="block text-xs text-yellow-400 hover:underline px-3 py-2 border-t border-[#1e2535]">
        Queued for approval →
      </Link>
    );
  }

  return (
    <form onSubmit={create} className="border-t border-[#1e2535] px-3 py-2 flex gap-1">
      <input
        autoFocus
        value={path}
        onChange={e => setPath(e.target.value)}
        placeholder="src/hello.py"
        className="flex-1 bg-[#1e2535] text-xs text-white rounded px-2 py-1 focus:outline-none"
      />
      <button
        type="submit"
        disabled={saving}
        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? '…' : 'Create'}
      </button>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VscodePage() {
  const [selected, setSelected] = useState('');

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Code2 size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">VSCode Workspace</h1>
            <p className="text-xs text-slate-500">AI-editable workspace · code-server on port 8080</p>
          </div>
        </div>
        <a
          href="http://localhost:8080"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-600/40 transition-colors"
        >
          Open in VSCode →
        </a>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col w-56 shrink-0">
          <FileExplorer onSelect={setSelected} selected={selected} />
          <NewFileForm />
        </div>
        <EditorPanel path={selected} />
      </div>
    </div>
  );
}
