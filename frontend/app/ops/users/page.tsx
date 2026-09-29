'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { TextField, SelectField, FormError, SubmitButton } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Role = 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR';

type User = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
};

const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'OWNER' },
  { value: 'MANAGER', label: 'MANAGER' },
  { value: 'WAITER', label: 'WAITER' },
  { value: 'AUDITOR', label: 'AUDITOR' },
];

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function UsersPage() {
  const { t, tError } = useT();
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [createUsername, setCreateUsername] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState<Role>('WAITER');
  const [createPassword, setCreatePassword] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const [editing, setEditing] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<Role>('WAITER');
  const [editBusy, setEditBusy] = useState(false);

  const [resetting, setResetting] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  function loadUsers() {
    return apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((res) => setUsers(res.users))
      .catch((e) => setErr(errOf(e)));
  }

  useEffect(() => {
    Promise.all([
      apiFetch<{ success: true; user: User }>('/api/v1/auth/me'),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users'),
    ])
      .then(([meRes, usersRes]) => {
        setMe(meRes.user);
        setUsers(usersRes.users);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }, []);

  const isOwner = me?.role === 'OWNER';

  function canEditTarget(target: User): boolean {
    if (!me) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') return target.id === me.id || target.role === 'WAITER';
    return false;
  }

  function canResetTarget(target: User): boolean {
    if (!me) return false;
    if (target.id === me.id) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') return target.role === 'WAITER';
    return false;
  }

  function canToggleActive(target: User): boolean {
    if (!me) return false;
    if (me.role !== 'OWNER') return false;
    if (target.id === me.id) return false;
    return true;
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setFlash(null);
    setCreateBusy(true);
    try {
      await apiFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          username: createUsername,
          fullName: createFullName,
          phone: createPhone.trim() === '' ? null : createPhone.trim(),
          role: createRole,
          password: createPassword,
        }),
      });
      setCreateUsername('');
      setCreateFullName('');
      setCreatePhone('');
      setCreateRole('WAITER');
      setCreatePassword('');
      setFlash(t('ops.users.flashCreated'));
      loadUsers();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setCreateBusy(false);
    }
  }

  function startEdit(u: User) {
    setEditing(u);
    setEditFullName(u.fullName);
    setEditPhone(u.phone ?? '');
    setEditRole(u.role);
    setErr(null);
    setFlash(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setErr(null);
    setFlash(null);
    setEditBusy(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: editFullName,
        phone: editPhone.trim() === '' ? null : editPhone.trim(),
      };
      if (isOwner && editing.id !== me?.id) {
        payload.role = editRole;
      }
      await apiFetch('/api/v1/users/' + editing.id, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditing(null);
      setFlash(t('ops.users.flashUpdated'));
      loadUsers();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setEditBusy(false);
    }
  }

  function startReset(u: User) {
    setResetting(u);
    setResetPassword('');
    setErr(null);
    setFlash(null);
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetting) return;
    setErr(null);
    setFlash(null);
    setResetBusy(true);
    try {
      await apiFetch('/api/v1/users/' + resetting.id + '/reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      setResetting(null);
      setResetPassword('');
      setFlash(t('ops.users.flashPasswordReset'));
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setResetBusy(false);
    }
  }

  async function toggleActive(u: User) {
    const verb = u.isActive ? t('action.deactivate') : t('action.reactivate');
    if (!window.confirm(verb + ' ' + u.username + '?')) return;
    setErr(null);
    setFlash(null);
    try {
      await apiFetch('/api/v1/users/' + u.id, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      setFlash(u.isActive ? t('ops.users.flashDeactivated') : t('ops.users.flashReactivated'));
      loadUsers();
    } catch (e) {
      setErr(errOf(e));
    }
  }

  const visible = includeInactive ? users : users.filter((u) => u.isActive);

  return (
    <OpsShell>
      <OpsHeader title={t('ops.users.title')} subtitle={t('ops.users.subtitle')} />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {flash}
        </div>
      )}

      {editing ? (
        <form onSubmit={saveEdit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>{t('ops.users.editHeadingPrefix')}{editing.username}</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <TextField label={t('form.fullName')} value={editFullName} onChange={setEditFullName} required />
            <TextField label={t('form.phoneOptional')} value={editPhone} onChange={setEditPhone} />
            {isOwner && editing.id !== me?.id && (
              <SelectField
                label={t('form.role')}
                value={editRole}
                onChange={(v) => setEditRole(v as Role)}
                options={ROLE_OPTIONS}
                required
              />
            )}
          </div>
          <div className='flex gap-2'>
            <SubmitButton busy={editBusy}>{t('action.save')}</SubmitButton>
            <button
              type='button'
              onClick={() => setEditing(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'
            >
              {t('action.cancel')}
            </button>
          </div>
        </form>
      ) : resetting ? (
        <form onSubmit={submitReset} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>{t('ops.users.resetHeadingPrefix')}{resetting.username}</h2>
          <p className='text-xs text-slate-500'>
            {t('ops.users.resetNote')}
          </p>
          <TextField
            label={t('form.newPassword')}
            type='password'
            value={resetPassword}
            onChange={setResetPassword}
            required
            autoComplete='new-password'
          />
          <div className='flex gap-2'>
            <SubmitButton busy={resetBusy}>{t('action.resetPassword')}</SubmitButton>
            <button
              type='button'
              onClick={() => setResetting(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'
            >
              {t('action.cancel')}
            </button>
          </div>
        </form>
      ) : isOwner ? (
        <form onSubmit={createUser} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>{t('ops.users.createHeading')}</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <TextField label={t('form.username')} value={createUsername} onChange={setCreateUsername} required />
            <TextField label={t('form.fullName')} value={createFullName} onChange={setCreateFullName} required />
            <TextField label={t('form.phoneOptional')} value={createPhone} onChange={setCreatePhone} />
            <SelectField
              label={t('form.role')}
              value={createRole}
              onChange={(v) => setCreateRole(v as Role)}
              options={ROLE_OPTIONS}
              required
            />
            <TextField
              label={t('form.initialPassword')}
              type='password'
              value={createPassword}
              onChange={setCreatePassword}
              required
              autoComplete='new-password'
            />
          </div>
          <SubmitButton busy={createBusy}>{t('action.createUser')}</SubmitButton>
        </form>
      ) : null}

      <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-medium text-slate-900'>{t('ops.users.allHeading')}</h2>
          <label className='text-sm text-slate-600 flex items-center gap-2'>
            <input
              type='checkbox'
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            {t('common.includeInactive')}
          </label>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='text-left px-2 py-2 font-medium'>{t('table.username')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.fullName')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.role')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.phone')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.status')}</th>
                <th className='text-left px-2 py-2 font-medium'>{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className='px-2 py-3 text-center text-slate-400'>{t('common.loading')}</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={6} className='px-2 py-3 text-center text-slate-400'>{t('ops.users.empty')}</td></tr>
              )}
              {visible.map((u) => (
                <tr key={u.id} className='border-t border-slate-100'>
                  <td className='px-2 py-2 font-mono text-xs'>{u.username}</td>
                  <td className='px-2 py-2'>{u.fullName}</td>
                  <td className='px-2 py-2'>{u.role}</td>
                  <td className='px-2 py-2 text-slate-500'>{u.phone ?? '-'}</td>
                  <td className='px-2 py-2'>
                    {u.isActive ? (
                      <span className='text-emerald-700'>{t('action.active')}</span>
                    ) : (
                      <span className='text-red-700'>{t('action.inactive')}</span>
                    )}
                  </td>
                  <td className='px-2 py-2'>
                    <div className='flex flex-wrap gap-2'>
                      {canEditTarget(u) && (
                        <button
                          type='button'
                          onClick={() => startEdit(u)}
                          aria-label={'Edit user ' + u.username}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'
                        >
                          {t('action.edit')}
                        </button>
                      )}
                      {canResetTarget(u) && (
                        <button
                          type='button'
                          onClick={() => startReset(u)}
                          aria-label={'Reset password for ' + u.username}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'
                        >
                          {t('action.resetPassword')}
                        </button>
                      )}
                      {canToggleActive(u) && (
                        <button
                          type='button'
                          onClick={() => toggleActive(u)}
                          aria-label={(u.isActive ? 'Deactivate ' : 'Reactivate ') + u.username}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'
                        >
                          {u.isActive ? t('action.deactivate') : t('action.reactivate')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </OpsShell>
  );
}
