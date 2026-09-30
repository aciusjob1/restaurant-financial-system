'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';

type Role = 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR';

type Me = { id: string; role: Role };

type User = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
};

type Position = { id: string; name: string; isActive: boolean };

type Employee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  phone: string | null;
  positionId: string;
  userId: string | null;
  employmentStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  startDate: string;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
};

const LOGIN_ROLES: Array<{ value: 'WAITER' | 'MANAGER'; label: string }> = [
  { value: 'WAITER', label: 'WAITER' },
  { value: 'MANAGER', label: 'MANAGER' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function StaffPage() {
  const { t, tError } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  // create form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [positionId, setPositionId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [giveLogin, setGiveLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<'WAITER' | 'MANAGER'>('WAITER');
  const [createBusy, setCreateBusy] = useState(false);

  // edit state
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPositionId, setEditPositionId] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // reset-password state
  const [resetting, setResetting] = useState<Employee | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // deactivate state
  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const [externalOpen, setExternalOpen] = useState(false);

  function loadAll() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; user: Me }>('/api/v1/auth/me'),
      apiFetch<{ success: true; employees: Employee[] }>('/api/v1/employees'),
      apiFetch<{ success: true; positions: Position[] }>('/api/v1/positions'),
      apiFetch<{ success: true; users: User[] }>('/api/v1/users').catch(() => ({ success: true as const, users: [] as User[] })),
    ])
      .then(([meRes, empRes, posRes, usrRes]) => {
        setMe(meRes.user);
        setEmployees(empRes.employees);
        setPositions(posRes.positions);
        setUsers(usrRes.users);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAll(); }, []);

  const isOwner = me?.role === 'OWNER';

  const activePositions = useMemo(() => positions.filter((p) => p.isActive), [positions]);

  const linkedUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of employees) if (e.userId) s.add(e.userId);
    return s;
  }, [employees]);

  const externalUsers = useMemo(() => {
    return users.filter((u) => !linkedUserIds.has(u.id) && (u.role === 'OWNER' || u.role === 'AUDITOR'));
  }, [users, linkedUserIds]);

  function positionName(id: string): string {
    const p = positions.find((x) => x.id === id);
    return p ? p.name : id.slice(0, 8);
  }

  function userForEmployee(emp: Employee): User | null {
    if (!emp.userId) return null;
    return users.find((u) => u.id === emp.userId) ?? null;
  }

  function canEdit(emp: Employee): boolean {
    if (!me) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') {
      const u = userForEmployee(emp);
      return u ? u.role === 'WAITER' : true;
    }
    return false;
  }

  function canReset(emp: Employee): boolean {
    if (!me) return false;
    const u = userForEmployee(emp);
    if (!u) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') return u.role === 'WAITER';
    return false;
  }

  function canDeactivate(emp: Employee): boolean {
    return isOwner === true && emp.isActive;
  }

  function clearCreate() {
    setFullName('');
    setPhone('');
    setNotes('');
    setGiveLogin(false);
    setLoginUsername('');
    setLoginPassword('');
    setLoginRole('WAITER');
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setFlash(null);
    setCreateBusy(true);
    try {
      const body: Record<string, unknown> = {
        fullName: fullName.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        positionId,
        startDate,
        notes: notes.trim() === '' ? null : notes.trim(),
      };
      const useLogin = isOwner && giveLogin;
      if (useLogin) {
        body.login = {
          username: loginUsername.trim(),
          password: loginPassword,
          role: loginRole,
        };
      }
      await apiFetch('/api/v1/employees', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      clearCreate();
      setFlash(useLogin ? t('ops.staff.flash.createdWithLogin') : t('ops.staff.flash.created'));
      loadAll();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setCreateBusy(false);
    }
  }

  function startEdit(emp: Employee) {
    setEditing(emp);
    setEditFullName(emp.fullName);
    setEditPhone(emp.phone ?? '');
    setEditPositionId(emp.positionId);
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
      await apiFetch('/api/v1/employees/' + editing.id, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editFullName.trim(),
          phone: editPhone.trim() === '' ? null : editPhone.trim(),
          positionId: editPositionId,
        }),
      });
      setEditing(null);
      setFlash(t('ops.staff.flash.updated'));
      loadAll();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setEditBusy(false);
    }
  }

  function startReset(emp: Employee) {
    setResetting(emp);
    setResetPassword('');
    setErr(null);
    setFlash(null);
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetting || !resetting.userId) return;
    setErr(null);
    setFlash(null);
    setResetBusy(true);
    try {
      await apiFetch('/api/v1/users/' + resetting.userId + '/reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      setResetting(null);
      setResetPassword('');
      setFlash(t('ops.staff.flash.passwordReset'));
      loadAll();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setResetBusy(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    setErr(null);
    setFlash(null);
    setDeactivateBusy(true);
    try {
      await apiFetch('/api/v1/employees/' + deactivating.id + '/deactivate', {
        method: 'POST',
      });
      setDeactivating(null);
      setFlash(t('ops.staff.flash.deactivated'));
      loadAll();
    } catch (e2) {
      setErr(errOf(e2));
    } finally {
      setDeactivateBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader title={t('ops.staff.title')} subtitle={t('ops.staff.subtitle')} />

      {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
      {flash && (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          {flash}
        </div>
      )}

      {editing ? (
        <form onSubmit={saveEdit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>{t('ops.staff.editHeading')}</h2>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <TextField label={t('form.fullName')} value={editFullName} onChange={setEditFullName} required />
            <TextField label={t('form.phoneOptional')} value={editPhone} onChange={setEditPhone} />
            <SelectField
              label={t('form.position')}
              value={editPositionId}
              onChange={setEditPositionId}
              required
              options={[
                { value: '', label: '\u2014 select \u2014' },
                ...activePositions.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <div className='flex gap-2'>
            <SubmitButton busy={editBusy}>{t('ops.staff.actions.save')}</SubmitButton>
            <button
              type='button'
              onClick={() => setEditing(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'
            >
              {t('ops.staff.actions.cancel')}
            </button>
          </div>
        </form>
      ) : resetting ? (
        <form onSubmit={submitReset} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('ops.staff.resetHeading')}{resetting.fullName}
          </h2>
          <p className='text-xs text-slate-500'>{t('ops.staff.resetNote')}</p>
          <TextField
            label={t('form.newPassword')}
            type='password'
            value={resetPassword}
            onChange={setResetPassword}
            required
            autoComplete='new-password'
          />
          <div className='flex gap-2'>
            <SubmitButton busy={resetBusy}>{t('ops.staff.actions.resetPassword')}</SubmitButton>
            <button
              type='button'
              onClick={() => setResetting(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'
            >
              {t('ops.staff.actions.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={createStaff} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>{t('ops.staff.createHeading')}</h2>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <TextField label={t('form.fullName')} value={fullName} onChange={setFullName} required />
            <TextField label={t('form.phoneOptional')} value={phone} onChange={setPhone} />
            <SelectField
              label={t('form.position')}
              value={positionId}
              onChange={setPositionId}
              required
              options={[
                { value: '', label: '\u2014 select \u2014' },
                ...activePositions.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <DateField label={t('form.startDate')} value={startDate} onChange={setStartDate} required />
          </div>
          <TextArea label={t('form.notesOptional')} value={notes} onChange={setNotes} rows={2} />

          {isOwner && (
            <div className='space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3'>
              <label className='flex items-center gap-2 text-sm text-slate-700'>
                <input
                  type='checkbox'
                  checked={giveLogin}
                  onChange={(e) => setGiveLogin(e.target.checked)}
                />
                {t('ops.staff.giveLogin')}
              </label>
              {giveLogin && (
                <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                  <TextField label={t('form.username')} value={loginUsername} onChange={setLoginUsername} required />
                  <TextField
                    label={t('form.initialPassword')}
                    type='password'
                    value={loginPassword}
                    onChange={setLoginPassword}
                    required
                    autoComplete='new-password'
                  />
                  <SelectField
                    label={t('form.role')}
                    value={loginRole}
                    onChange={(v) => setLoginRole(v as 'WAITER' | 'MANAGER')}
                    options={LOGIN_ROLES}
                    required
                  />
                </div>
              )}
            </div>
          )}

          <SubmitButton busy={createBusy}>
            {isOwner && giveLogin ? t('ops.staff.createSubmitWithLogin') : t('ops.staff.createSubmit')}
          </SubmitButton>
          {activePositions.length === 0 && (
            <div className='text-xs text-amber-700'>{t('ops.staff.noPositions')}</div>
          )}
        </form>
      )}

      <div className='rounded-2xl border border-slate-200 bg-white overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.emp')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.name')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.position')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.phone')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.employment')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.login')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('ops.staff.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && employees.length === 0 && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('ops.staff.empty')}</td></tr>
            )}
            {employees.map((emp) => {
              const u = userForEmployee(emp);
              return (
                <tr key={emp.id} className='border-t border-slate-100'>
                  <td className='px-3 py-2 font-mono text-slate-500'>{emp.employeeNumber}</td>
                  <td className='px-3 py-2'>
                    {emp.fullName}
                    {!emp.isActive && <span className='ml-2 text-xs text-slate-400'>inactive</span>}
                  </td>
                  <td className='px-3 py-2'>{positionName(emp.positionId)}</td>
                  <td className='px-3 py-2 text-slate-600'>{emp.phone ?? '\u2014'}</td>
                  <td className='px-3 py-2'>
                    <span className='text-xs rounded bg-slate-100 px-2 py-0.5'>{emp.employmentStatus}</span>
                  </td>
                  <td className='px-3 py-2'>
                    {u ? (
                      <span className='font-mono text-xs'>{u.username}</span>
                    ) : (
                      <span className='text-slate-400'>{t('ops.staff.noLogin')}</span>
                    )}
                  </td>
                  <td className='px-3 py-2'>
                    <div className='flex flex-wrap gap-2'>
                      {canEdit(emp) && (
                        <button
                          type='button'
                          onClick={() => startEdit(emp)}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'
                        >
                          {t('ops.staff.actions.edit')}
                        </button>
                      )}
                      {canReset(emp) && (
                        <button
                          type='button'
                          onClick={() => startReset(emp)}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'
                        >
                          {t('ops.staff.actions.resetPassword')}
                        </button>
                      )}
                      {canDeactivate(emp) && (
                        <button
                          type='button'
                          onClick={() => setDeactivating(emp)}
                          className='rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50'
                        >
                          {t('ops.staff.actions.deactivate')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {externalUsers.length > 0 && (
        <section className='rounded-2xl border border-slate-200 bg-white p-4 space-y-2'>
          <button
            type='button'
            onClick={() => setExternalOpen(!externalOpen)}
            className='text-xs font-medium text-slate-500 uppercase tracking-wide hover:text-slate-700'
          >
            {t('ops.staff.externalHeading')} ({externalUsers.length})
          </button>
          {externalOpen && (
            <div className='space-y-2 pt-2'>
              <p className='text-xs text-slate-500'>{t('ops.staff.externalNote')}</p>
              <ul className='text-sm text-slate-700 space-y-1'>
                {externalUsers.map((u) => (
                  <li key={u.id} className='font-mono text-xs'>
                    {u.username} \u2014 {u.role}{u.isActive ? '' : ' (inactive)'}
                  </li>
                ))}
              </ul>
              <Link
                href='/ops/users'
                className='inline-block text-xs text-slate-700 underline hover:text-slate-900'
              >
                {t('ops.staff.externalLink')}
              </Link>
            </div>
          )}
        </section>
      )}

      {deactivating && (
        <div className='fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl border border-slate-200 p-5 max-w-md w-full space-y-4'>
            <h3 className='text-base font-medium text-slate-900'>{t('ops.staff.deactivateHeading')}</h3>
            <p className='text-sm text-slate-700'>{t('ops.staff.deactivateConfirm')}</p>
            <p className='text-sm font-medium text-slate-900'>{deactivating.fullName}</p>
            <div className='flex gap-2 justify-end'>
              <button
                type='button'
                onClick={confirmDeactivate}
                disabled={deactivateBusy}
                className='rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'
              >
                {deactivateBusy ? t('ops.staff.actions.deactivating') : t('ops.staff.actions.deactivate')}
              </button>
              <button
                type='button'
                onClick={() => setDeactivating(null)}
                className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'
              >
                {t('ops.staff.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </OpsShell>
  );
}
