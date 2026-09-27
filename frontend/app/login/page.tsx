'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await apiFetch<{ success: true; user: { role: string } }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      // WAITERs land on the kiosk; every other role on the dashboard.
      router.push(res.user.role === 'WAITER' ? '/kiosk' : '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit}
            className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-slate-500">Restaurant Financial System</p>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium">Username</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                 value={username} onChange={(e) => setUsername(e.target.value)}
                 autoComplete="username" required />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input type="password"
                 className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 autoComplete="current-password" required />
        </label>

        <button type="submit" disabled={busy}
                className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-60">
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}