'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { Brain, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm]     = useState({ username: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoad]  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoad(true);
    setError('');
    try {
      const { accessToken } = await api.auth.login(form.username, form.password);
      setToken(accessToken);
      router.push('/');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoad(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto">
            <Brain size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">AI OS</h1>
          <p className="text-sm text-slate-500">Sign in to the admin dashboard</p>
        </div>

        {/* Form */}
        <form
          onSubmit={submit}
          className="bg-[#0f1117] border border-[#1e2535] rounded-xl p-6 space-y-4"
        >
          <label className="block">
            <span className="text-xs text-slate-400 mb-1.5 block">Username</span>
            <input
              required autoFocus autoComplete="username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1.5 block">Password</span>
            <input
              type="password" required autoComplete="current-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
            />
          </label>

          {error && (
            <p className="text-red-400 text-xs flex items-center gap-1.5">
              <Lock size={11} /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          Default: admin / changeme (set ADMIN_PASSWORD in .env)
        </p>
      </div>
    </div>
  );
}
