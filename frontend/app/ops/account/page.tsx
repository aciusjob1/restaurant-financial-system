'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { TextField, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

type Me = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  autoApproveExpenses: boolean;
  autoReviewReconciliations: boolean;
  autoConfirmHandovers: boolean;
};

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState<{ code: string; message: string } | null>(null);
  const [profileOk, setProfileOk] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<{ code: string; message: string } | null>(null);

  const [signOutBusy, setSignOutBusy] = useState(false);

  const [prefAutoApproveExpenses, setPrefAutoApproveExpenses] = useState(false);
  const [prefAutoReviewReconciliations, setPrefAutoReviewReconciliations] = useState(false);
  const [prefAutoConfirmHandovers, setPrefAutoConfirmHandovers] = useState(false);
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefErr, setPrefErr] = useState<{ code: string; message: string } | null>(null);
  const [prefOk, setPrefOk] = useState(false);

  useEffect(() => {
    apiFetch<{ success: true; user: Me }>('/api/v1/auth/me')
      .then((res) => {
        setMe(res.user);
        setFullName(res.user.fullName);
        setPhone(res.user.phone ?? '');
        setPrefAutoApproveExpenses(res.user.autoApproveExpenses ?? false);
        setPrefAutoReviewReconciliations(res.user.autoReviewReconciliations ?? false);
        setPrefAutoConfirmHandovers(res.user.autoConfirmHandovers ?? false);
      })
      .catch((e) => setProfileErr(errOf(e)))
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileErr(null);
    setProfileOk(false);
    try {
      const trimmed = phone.trim();
      const res = await apiFetch<{ success: true; user: Me }>('/api/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          phone: trimmed === '' ? null : trimmed,
        }),
      });
      setMe(res.user);
      setPhone(res.user.phone ?? '');
      setProfileOk(true);
    } catch (e2) {
      setProfileErr(errOf(e2));
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePreferences(e: FormEvent) {
    e.preventDefault();
    setPrefBusy(true);
    setPrefErr(null);
    setPrefOk(false);
    try {
      const res = await apiFetch<{ success: true; user: Me }>('/api/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          autoApproveExpenses: prefAutoApproveExpenses,
          autoReviewReconciliations: prefAutoReviewReconciliations,
          autoConfirmHandovers: prefAutoConfirmHandovers,
        }),
      });
      setMe(res.user);
      setPrefOk(true);
    } catch (e2) {
      setPrefErr(errOf(e2));
    } finally {
      setPrefBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwErr(null);
    if (newPassword !== confirmPassword) {
      setPwErr({ code: 'MISMATCH', message: 'New password and confirmation do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.push('/login');
    } catch (e2) {
      setPwErr(errOf(e2));
      setPwBusy(false);
    }
  }

  async function signOut() {
    setSignOutBusy(true);
    try { await apiFetch('/api/v1/auth/logout', { method: 'POST' }); } catch {}
    router.push('/login');
  }

  return (
    <OpsShell>
      <OpsHeader title="Account" subtitle="Your profile, password, and session." />

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : (
        <>
          <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-medium text-slate-900">Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <TextField label="Full name" value={fullName} onChange={setFullName} required />
              <TextField label="Phone (optional)" value={phone} onChange={setPhone} autoComplete="tel" />
              <TextField label="Username" value={me?.username ?? ''} onChange={() => {}} disabled />
              <TextField label="Role" value={me?.role ?? ''} onChange={() => {}} disabled />
            </div>
            {profileErr && <FormError code={profileErr.code} message={profileErr.message} />}
            {profileOk && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Profile saved.
              </div>
            )}
            <SubmitButton busy={profileBusy}>Save profile</SubmitButton>
          </form>

          {me?.role === 'OWNER' && (
            <form onSubmit={savePreferences} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <h2 className="text-base font-medium text-slate-900">Auto-approval preferences</h2>
                <p className="text-xs text-slate-500 mt-1">
                  These only affect records you create. Managers are unaffected.
                </p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={prefAutoApproveExpenses}
                    onChange={(e) => setPrefAutoApproveExpenses(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Auto-approve my expenses
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={prefAutoReviewReconciliations}
                    onChange={(e) => setPrefAutoReviewReconciliations(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Auto-review my reconciliations
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={prefAutoConfirmHandovers}
                    onChange={(e) => setPrefAutoConfirmHandovers(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Auto-confirm my handovers
                </label>
              </div>
              {prefErr && <FormError code={prefErr.code} message={prefErr.message} />}
              {prefOk && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Preferences saved.
                </div>
              )}
              <SubmitButton busy={prefBusy}>Save preferences</SubmitButton>
            </form>
          )}

          <form onSubmit={changePassword} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-medium text-slate-900">Change password</h2>
            <p className="text-xs text-slate-500">
              Minimum 12 characters. You will be signed out everywhere on success.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <TextField label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} required autoComplete="current-password" />
              <TextField label="New password" type="password" value={newPassword} onChange={setNewPassword} required autoComplete="new-password" />
              <TextField label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
            </div>
            {pwErr && <FormError code={pwErr.code} message={pwErr.message} />}
            <SubmitButton busy={pwBusy}>Change password</SubmitButton>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-medium text-slate-900">Session</h2>
            <p className="text-sm text-slate-500">Sign out of this browser.</p>
            <button
              type="button"
              onClick={signOut}
              disabled={signOutBusy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {signOutBusy ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </OpsShell>
  );
}