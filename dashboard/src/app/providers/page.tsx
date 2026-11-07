'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import type { Provider } from '@/lib/types';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';

// ─────────────────────────────────────────
// Modal
// ─────────────────────────────────────────
function ProviderModal({
  provider, onClose, onSave,
}: { provider?: Provider; onClose: () => void; onSave: () => void }) {
  const editing = !!provider;
  const [form, setForm] = useState({
    name:         provider?.name        ?? '',
    apiKey:       '',
    priority:     provider?.priority    ?? 5,
    modelDefault: provider?.modelDefault ?? '',
    costPer1k:    provider?.costPer1k   ?? 0,
    rateLimit:    provider?.rateLimit   ?? 1000,
    fallbackTo:   provider?.fallbackTo  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        apiKey:      form.apiKey       || undefined,
        modelDefault: form.modelDefault || undefined,
        fallbackTo:  form.fallbackTo   || undefined,
      };
      if (editing) await api.providers.update(provider!.id, body);
      else         await api.providers.create(body);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <input
        type={type}
        value={String(form[key])}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-full bg-[#161b27] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
          <h2 className="text-sm font-semibold text-white">
            {editing ? `Edit — ${provider!.name}` : 'Add Provider'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!editing && field('Provider Name', 'name', 'text', 'e.g. claude, gpt, gemini')}
          {field('API Key', 'apiKey', 'password', editing ? 'Leave blank to keep current' : 'sk-ant-...')}
          {field('Default Model', 'modelDefault', 'text', 'claude-sonnet-4-6')}
          <div className="grid grid-cols-3 gap-3">
            {field('Priority', 'priority', 'number')}
            {field('Cost /1k', 'costPer1k', 'number')}
            {field('Rate Limit', 'rateLimit', 'number')}
          </div>
          {field('Fallback To', 'fallbackTo', 'text', 'gpt')}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#161b27] hover:bg-[#1e2535] text-slate-300 text-sm py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Page
// ─────────────────────────────────────────
export default function ProvidersPage() {
  const { data: providers, mutate } = useSWR<Provider[]>(
    'providers', () => api.providers.list() as Promise<Provider[]>
  );
  const [modal, setModal] = useState<'add' | Provider | null>(null);

  async function toggleEnabled(p: Provider) {
    await api.providers.update(p.id, { enabled: !p.enabled });
    mutate();
  }

  async function remove(p: Provider) {
    if (!confirm(`Remove "${p.name}"?`)) return;
    await api.providers.remove(p.id);
    mutate();
  }

  const sorted = [...(providers ?? [])].sort((a, b) => a.priority - b.priority);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Providers</h1>
          <p className="text-slate-400 text-sm mt-1">Manage API keys, routing priorities, and fallback chains</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Add Provider
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#0f1117] border border-[#1e2535] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2535]">
              {['Provider', 'Status', 'Model', 'Priority', 'Cost /1k', 'Rate Limit', 'Fallback', ''].map(h => (
                <th key={h} className="text-left text-xs text-slate-500 font-medium px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">No providers — add one to get started</td></tr>
            )}
            {sorted.map(p => (
              <tr key={p.id} className="border-b border-[#1e2535] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3.5">
                  <span className="font-medium text-white capitalize">{p.name}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={clsx('flex items-center gap-1.5 text-xs font-medium', p.enabled ? 'text-green-400' : 'text-slate-500')}>
                    <span className={clsx('w-1.5 h-1.5 rounded-full', p.enabled ? 'bg-green-400' : 'bg-slate-600')} />
                    {p.enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{p.modelDefault ?? '—'}</td>
                <td className="px-5 py-3.5 text-slate-300">#{p.priority}</td>
                <td className="px-5 py-3.5 text-slate-300">${p.costPer1k}</td>
                <td className="px-5 py-3.5 text-slate-300">{p.rateLimit}/min</td>
                <td className="px-5 py-3.5 text-slate-400">{p.fallbackTo ?? '—'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleEnabled(p)} className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors" title={p.enabled ? 'Disable' : 'Enable'}>
                      {p.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => setModal(p)} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(p)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ProviderModal
          provider={modal === 'add' ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={() => { mutate(); setModal(null); }}
        />
      )}
    </div>
  );
}
