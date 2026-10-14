'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  lastLogin: string | null;
  createdAt: string;
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

type StaffRow = {
  key: string;
  kind: 'linked' | 'employee-only' | 'user-only';
  employee: Employee | null;
  user: User | null;
};

const LOGIN_ROLES: Array<{ value: 'WAITER' | 'MANAGER'; label: string }> = [
  { value: 'WAITER', label: 'WAITER' },
  { value: 'MANAGER', label: 'MANAGER' },
];

const ACCOUNT_ROLES: Array<{ value: Role; label: string }> = [
  { value: 'OWNER', label: 'OWNER' },
  { value: 'MANAGER', label: 'MANAGER' },
  { value: 'WAITER', label: 'WAITER' },
  { value: 'AUDITOR', label: 'AUDITOR' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

type CreateMode = 'staff' | 'account';

export default function StaffPage() {
  const { t, tError } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Independent loading flags. Each fetch has its own state so one
  // failure cannot block or misrepresent the others.
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesLoadFailed, setEmployeesLoadFailed] = useState(false);
  const [positionsLoadFailed, setPositionsLoadFailed] = useState(false);
  const [accountsLoadFailed, setAccountsLoadFailed] = useState(false);

  // create
  const [createMode, setCreateMode] = useState<CreateMode>('staff');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [positionId, setPositionId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [giveLogin, setGiveLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<'WAITER' | 'MANAGER'>('WAITER');
  const [acctUsername, setAcctUsername] = useState('');
  const [acctFullName, setAcctFullName] = useState('');
  const [acctPhone, setAcctPhone] = useState('');
  const [acctRole, setAcctRole] = useState<Role>('WAITER');
  const [acctPassword, setAcctPassword] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // edit staff
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPositionId, setEditPositionId] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // edit account
  const [editingAcct, setEditingAcct] = useState<User | null>(null);
  const [editAcctFullName, setEditAcctFullName] = useState('');
  const [editAcctPhone, setEditAcctPhone] = useState('');
  const [editAcctRole, setEditAcctRole] = useState<Role>('WAITER');
  const [editAcctBusy, setEditAcctBusy] = useState(false);

  // reset password
  const [resetting, setResetting] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // create login for existing employee
  const [creatingLoginFor, setCreatingLoginFor] = useState<Employee | null>(null);
  const [newLoginUsername, setNewLoginUsername] = useState('');
  const [newLoginPassword, setNewLoginPassword] = useState('');
  const [newLoginRole, setNewLoginRole] = useState<'WAITER' | 'MANAGER'>('WAITER');
  const [createLoginBusy, setCreateLoginBusy] = useState(false);

  // deactivate staff (cascades to linked account)
  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  // toggle user-only account active
  const [togglingUser, setTogglingUser] = useState<User | null>(null);
  const [togglingBusy, setTogglingBusy] = useState(false);

  // Set PIN (waiters only; the server rejects non-WAITER targets with
  // PIN_ONLY_FOR_WAITERS).
  const [settingPinFor, setSettingPinFor] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  // Four independent fetches. /auth/me gates the page's readiness;
  // the other three populate or fail on their own. On failure we keep
  // whatever was previously loaded so a transient error does not wipe
  // the table.
  function loadAll() {
    setErr(null);

    apiFetch<{ success: true; user: Me }>('/api/v1/auth/me')
      .then((meRes) => setMe(meRes.user))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));

    setEmployeesLoading(true);
    apiFetch<{ success: true; employees: Employee[] }>('/api/v1/employees')
      .then((res) => {
        setEmployees(res.employees);
        setEmployeesLoadFailed(false);
      })
      .catch(() => {
        setEmployeesLoadFailed(true);
        // Dedicated red banner covers this; do not also set `err`.
      })
      .finally(() => setEmployeesLoading(false));

    apiFetch<{ success: true; positions: Position[] }>('/api/v1/positions')
      .then((res) => {
        setPositions(res.positions);
        setPositionsLoadFailed(false);
      })
      .catch(() => {
        setPositionsLoadFailed(true);
        // Yellow banner only; not routed through `err`.
      });

    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((res) => {
        setUsers(res.users);
        setAccountsLoadFailed(false);
      })
      .catch(() => {
        setAccountsLoadFailed(true);
        // Yellow banner only; not routed through `err`.
      });
  }

  useEffect(() => { loadAll(); }, []);

  const isOwner = me?.role === 'OWNER';
  const activePositions = useMemo(() => positions.filter((p) => p.isActive), [positions]);

  // Merged rows. Join is strictly Employee.userId === User.id; never names.
  const rows: StaffRow[] = useMemo(() => {
    const userById = new Map(users.map((u) => [u.id, u]));
    const linkedUserIds = new Set<string>();
    const out: StaffRow[] = [];
    for (const emp of employees) {
      const u = emp.userId ? userById.get(emp.userId) ?? null : null;
      if (u) linkedUserIds.add(u.id);
      out.push({
        key: emp.id,
        kind: u ? 'linked' : 'employee-only',
        employee: emp,
        user: u,
      });
    }
    for (const u of users) {
      if (linkedUserIds.has(u.id)) continue;
      out.push({ key: u.id, kind: 'user-only', employee: null, user: u });
    }
    return out;
  }, [employees, users]);

  function positionName(id: string): string {
    const p = positions.find((x) => x.id === id);
    return p ? p.name : id.slice(0, 8);
  }

  // ---- Permission helpers (parity with the two original pages) ----
  function canEditStaff(emp: Employee): boolean {
    if (!me) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') {
      if (!emp.userId) return true;
      const u = users.find((x) => x.id === emp.userId);
      return u ? u.role === 'WAITER' : true;
    }
    return false;
  }
  function canEditAccount(u: User): boolean {
    if (!me) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') return u.id === me.id || u.role === 'WAITER';
    return false;
  }
  function canReset(u: User): boolean {
    if (!me) return false;
    if (u.id === me.id) return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') return u.role === 'WAITER';
    return false;
  }
  function canDeactivateStaff(emp: Employee): boolean {
    return isOwner === true && emp.isActive;
  }
  function canToggleActive(u: User): boolean {
    if (!me) return false;
    if (me.role !== 'OWNER') return false;
    if (u.id === me.id) return false;
    return true;
  }
  function canCreateLoginFor(emp: Employee): boolean {
    return isOwner === true && !emp.userId && emp.isActive && !accountsLoadFailed;
  }
  function canSetPin(u: User): boolean {
    if (!me) return false;
    // Server rejects non-WAITER targets with PIN_ONLY_FOR_WAITERS.
    // Only show the button where it can succeed.
    if (u.role !== 'WAITER') return false;
    if (me.role === 'OWNER') return true;
    if (me.role === 'MANAGER') return true;
    return false;
  }

  // ---- Create ----
  function clearCreate() {
    setFullName(''); setPhone(''); setNotes('');
    setGiveLogin(false); setLoginUsername(''); setLoginPassword(''); setLoginRole('WAITER');
    setAcctUsername(''); setAcctFullName(''); setAcctPhone(''); setAcctRole('WAITER'); setAcctPassword('');
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setErr(null); setFlash(null); setCreateBusy(true);
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
        body.login = { username: loginUsername.trim(), password: loginPassword, role: loginRole };
      }
      await apiFetch('/api/v1/employees', { method: 'POST', body: JSON.stringify(body) });
      clearCreate();
      setFlash(useLogin ? t('ops.staff.flash.createdWithLogin') : t('ops.staff.flash.created'));
      loadAll();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setCreateBusy(false); }
  }

  async function createAccountOnly(e: FormEvent) {
    e.preventDefault();
    setErr(null); setFlash(null); setCreateBusy(true);
    try {
      await apiFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          username: acctUsername.trim(),
          fullName: acctFullName.trim(),
          phone: acctPhone.trim() === '' ? null : acctPhone.trim(),
          role: acctRole,
          password: acctPassword,
        }),
      });
      clearCreate();
      setFlash(t('ops.users.flashCreated'));
      loadAll();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setCreateBusy(false); }
  }

  // ---- Edit staff ----
  function startEditStaff(emp: Employee) {
    setEditing(emp);
    setEditFullName(emp.fullName);
    setEditPhone(emp.phone ?? '');
    setEditPositionId(emp.positionId);
    setErr(null); setFlash(null);
  }
  async function saveEditStaff(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setErr(null); setFlash(null); setEditBusy(true);
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
    } catch (e2) { setErr(errOf(e2)); }
    finally { setEditBusy(false); }
  }

  // ---- Edit account ----
  function startEditAccount(u: User) {
    setEditingAcct(u);
    setEditAcctFullName(u.fullName);
    setEditAcctPhone(u.phone ?? '');
    setEditAcctRole(u.role);
    setErr(null); setFlash(null);
  }
  async function saveEditAccount(e: FormEvent) {
    e.preventDefault();
    if (!editingAcct) return;
    setErr(null); setFlash(null); setEditAcctBusy(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: editAcctFullName.trim(),
        phone: editAcctPhone.trim() === '' ? null : editAcctPhone.trim(),
      };
      if (isOwner && editingAcct.id !== me?.id) {
        payload.role = editAcctRole;
      }
      await apiFetch('/api/v1/users/' + editingAcct.id, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingAcct(null);
      setFlash(t('ops.users.flashUpdated'));
      loadAll();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setEditAcctBusy(false); }
  }

  // ---- Reset password ----
  function startReset(u: User) {
    setResetting(u); setResetPassword(''); setErr(null); setFlash(null);
  }
  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetting) return;
    setErr(null); setFlash(null); setResetBusy(true);
    try {
      await apiFetch('/api/v1/users/' + resetting.id + '/reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      setResetting(null); setResetPassword('');
      setFlash(t('ops.users.flashPasswordReset'));
      loadAll();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setResetBusy(false); }
  }

  // ---- Set PIN ----
  function startSetPin(u: User) {
    setSettingPinFor(u);
    setNewPin('');
    setErr(null); setFlash(null);
  }
  async function submitSetPin(e: FormEvent) {
    e.preventDefault();
    if (!settingPinFor) return;
    setErr(null); setFlash(null); setPinBusy(true);
    try {
      await apiFetch('/api/v1/auth/set-pin', {
        method: 'POST',
        body: JSON.stringify({ userId: settingPinFor.id, pin: newPin }),
      });
      setSettingPinFor(null);
      setNewPin('');
      setFlash(t('ops.staff.flash.pinSet'));
    } catch (e2) { setErr(errOf(e2)); }
    finally { setPinBusy(false); }
  }

  // ---- Create login for existing employee ----
  function startCreateLogin(emp: Employee) {
    setCreatingLoginFor(emp);
    setNewLoginUsername(''); setNewLoginPassword(''); setNewLoginRole('WAITER');
    setErr(null); setFlash(null);
  }
  async function submitCreateLogin(e: FormEvent) {
    e.preventDefault();
    if (!creatingLoginFor) return;
    setErr(null); setFlash(null); setCreateLoginBusy(true);
    const username = newLoginUsername.trim();
    try {
      const userRes = await apiFetch<{ success: true; user: User }>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          fullName: creatingLoginFor.fullName,
          phone: creatingLoginFor.phone,
          role: newLoginRole,
          password: newLoginPassword,
        }),
      });
      try {
        await apiFetch('/api/v1/employees/' + creatingLoginFor.id, {
          method: 'PATCH',
          body: JSON.stringify({ userId: userRes.user.id }),
        });
        setCreatingLoginFor(null);
        setFlash(t('ops.staff.flash.loginCreated'));
        loadAll();
      } catch {
        // Account created, link failed. The two-step flow has no rollback.
        // The account now exists as a user-only row below. This page does
        // not offer a way to link it to this staff record afterward.
        setCreatingLoginFor(null);
        setErr({
          code: 'LOGIN_CREATED_NOT_LINKED',
          message: t('ops.staff.flash.loginCreatedNotLinked') + ' ' + username,
        });
        loadAll();
      }
    } catch (e2) { setErr(errOf(e2)); }
    finally { setCreateLoginBusy(false); }
  }

  // ---- Deactivate staff ----
  async function confirmDeactivate() {
    if (!deactivating) return;
    setErr(null); setFlash(null); setDeactivateBusy(true);
    try {
      await apiFetch('/api/v1/employees/' + deactivating.id + '/deactivate', { method: 'POST' });
      setDeactivating(null);
      setFlash(t('ops.staff.flash.deactivated'));
      loadAll();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setDeactivateBusy(false); }
  }

  // ---- Toggle user-only account ----
  async function confirmToggleUser() {
    if (!togglingUser) return;
    setErr(null); setFlash(null); setTogglingBusy(true);
    try {
      await apiFetch('/api/v1/users/' + togglingUser.id, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !togglingUser.isActive }),
      });
      setFlash(togglingUser.isActive ? t('ops.users.flashDeactivated') : t('ops.users.flashReactivated'));
      setTogglingUser(null);
      loadAll();
    } catch (e2) { setErr(errOf(e2)); }
    finally { setTogglingBusy(false); }
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
      {employeesLoadFailed && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800'>
          {t('ops.staff.employeesNotLoaded')}
        </div>
      )}
      {positionsLoadFailed && !employeesLoadFailed && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
          {t('ops.staff.positionsNotLoaded')}
        </div>
      )}
      {accountsLoadFailed && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
          {t('ops.staff.accountsNotLoaded')}
        </div>
      )}

      {editing && (
        <form onSubmit={saveEditStaff} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
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
            <button type='button' onClick={() => setEditing(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
              {t('ops.staff.actions.cancel')}
            </button>
          </div>
        </form>
      )}

      {editingAcct && (
        <form onSubmit={saveEditAccount} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('ops.users.editHeadingPrefix')}{editingAcct.username}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <TextField label={t('form.fullName')} value={editAcctFullName} onChange={setEditAcctFullName} required />
            <TextField label={t('form.phoneOptional')} value={editAcctPhone} onChange={setEditAcctPhone} />
            {isOwner && editingAcct.id !== me?.id && (
              <SelectField
                label={t('form.role')}
                value={editAcctRole}
                onChange={(v) => setEditAcctRole(v as Role)}
                options={ACCOUNT_ROLES}
                required
              />
            )}
          </div>
          <div className='flex gap-2'>
            <SubmitButton busy={editAcctBusy}>{t('action.save')}</SubmitButton>
            <button type='button' onClick={() => setEditingAcct(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
              {t('action.cancel')}
            </button>
          </div>
        </form>
      )}

      {resetting && (
        <form onSubmit={submitReset} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('ops.users.resetHeadingPrefix')}{resetting.username}
          </h2>
          <p className='text-xs text-slate-500'>{t('ops.users.resetNote')}</p>
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
            <button type='button' onClick={() => setResetting(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
              {t('action.cancel')}
            </button>
          </div>
        </form>
      )}

      {settingPinFor && (
        <form onSubmit={submitSetPin} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('ops.staff.setPinHeading')}{settingPinFor.username}
          </h2>
          <p className='text-xs text-slate-500'>{t('ops.staff.setPinNote')}</p>
          <TextField
            label={t('ops.staff.setPinLabel')}
            value={newPin}
            onChange={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 6))}
            required
          />
          <div className='flex gap-2'>
            <SubmitButton busy={pinBusy}>{t('ops.staff.actions.setPin')}</SubmitButton>
            <button type='button' onClick={() => setSettingPinFor(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
              {t('action.cancel')}
            </button>
          </div>
        </form>
      )}

      {creatingLoginFor && (
        <form onSubmit={submitCreateLogin} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <h2 className='text-base font-medium text-slate-900'>
            {t('ops.staff.createLoginHeading')}{creatingLoginFor.fullName}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <TextField label={t('form.username')} value={newLoginUsername} onChange={setNewLoginUsername} required />
            <TextField
              label={t('form.initialPassword')}
              type='password'
              value={newLoginPassword}
              onChange={setNewLoginPassword}
              required
              autoComplete='new-password'
            />
            <SelectField
              label={t('form.role')}
              value={newLoginRole}
              onChange={(v) => setNewLoginRole(v as 'WAITER' | 'MANAGER')}
              options={LOGIN_ROLES}
              required
            />
          </div>
          <div className='flex gap-2'>
            <SubmitButton busy={createLoginBusy}>{t('ops.staff.createLoginSubmit')}</SubmitButton>
            <button type='button' onClick={() => setCreatingLoginFor(null)}
              className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
              {t('action.cancel')}
            </button>
          </div>
        </form>
      )}

      {!editing && !editingAcct && !resetting && !creatingLoginFor && !settingPinFor && (
        <div className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-medium text-slate-900'>{t('ops.staff.createHeading')}</h2>
            {isOwner && (
              <div className='flex gap-2 text-xs'>
                <button
                  type='button'
                  onClick={() => setCreateMode('staff')}
                  className={'px-2 py-1 rounded ' + (createMode === 'staff'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 text-slate-700')}
                >
                  {t('ops.staff.mode.staff')}
                </button>
                <button
                  type='button'
                  onClick={() => setCreateMode('account')}
                  className={'px-2 py-1 rounded ' + (createMode === 'account'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 text-slate-700')}
                >
                  {t('ops.staff.mode.account')}
                </button>
              </div>
            )}
          </div>

          {createMode === 'staff' ? (
            <form onSubmit={createStaff} className='space-y-4'>
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
                    <input type='checkbox' checked={giveLogin} onChange={(e) => setGiveLogin(e.target.checked)} />
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
          ) : (
            <form onSubmit={createAccountOnly} className='space-y-4'>
              <p className='text-xs text-slate-500'>{t('ops.staff.mode.accountNote')}</p>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <TextField label={t('form.username')} value={acctUsername} onChange={setAcctUsername} required />
                <TextField label={t('form.fullName')} value={acctFullName} onChange={setAcctFullName} required />
                <TextField label={t('form.phoneOptional')} value={acctPhone} onChange={setAcctPhone} />
                <SelectField
                  label={t('form.role')}
                  value={acctRole}
                  onChange={(v) => setAcctRole(v as Role)}
                  options={ACCOUNT_ROLES}
                  required
                />
                <TextField
                  label={t('form.initialPassword')}
                  type='password'
                  value={acctPassword}
                  onChange={setAcctPassword}
                  required
                  autoComplete='new-password'
                />
              </div>
              <SubmitButton busy={createBusy}>{t('ops.users.createHeading')}</SubmitButton>
            </form>
          )}
        </div>
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
            {!loading && employeesLoading && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && !employeesLoading && !employeesLoadFailed && rows.length === 0 && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-slate-400'>{t('ops.staff.empty')}</td></tr>
            )}
            {!loading && !employeesLoading && employeesLoadFailed && rows.length === 0 && (
              <tr><td colSpan={7} className='px-3 py-6 text-center text-red-700'>{t('ops.staff.employeesNotLoaded')}</td></tr>
            )}
            {rows.map((row) => {
              const emp = row.employee;
              const u = row.user;
              return (
                <tr key={row.key} className='border-t border-slate-100'>
                  <td className='px-3 py-2 font-mono text-slate-500'>
                    {emp ? emp.employeeNumber : t('ops.staff.noStaffRecord')}
                  </td>
                  <td className='px-3 py-2'>
                    {emp ? emp.fullName : (u ? u.fullName : '\u2014')}
                    {emp && !emp.isActive && <span className='ml-2 text-xs text-slate-400'>(inactive)</span>}
                  </td>
                  <td className='px-3 py-2'>
                    {emp ? positionName(emp.positionId) : (u ? u.role : '\u2014')}
                  </td>
                  <td className='px-3 py-2 text-slate-600'>
                    {(emp?.phone ?? u?.phone) ?? '\u2014'}
                  </td>
                  <td className='px-3 py-2'>
                    {emp ? (
                      <span className='text-xs rounded bg-slate-100 px-2 py-0.5'>{emp.employmentStatus}</span>
                    ) : (
                      <span className='text-xs text-slate-400'>{t('ops.staff.noStaffRecord')}</span>
                    )}
                  </td>
                  <td className='px-3 py-2'>
                    {accountsLoadFailed ? (
                      <span className='text-xs text-amber-700'>{t('ops.staff.accountsNotLoaded')}</span>
                    ) : u ? (
                      <span className='font-mono text-xs'>
                        {u.username}
                        {!u.isActive && <span className='ml-1 text-slate-400'>(inactive)</span>}
                      </span>
                    ) : (
                      <span className='text-slate-400'>{t('ops.staff.noLogin')}</span>
                    )}
                  </td>
                  <td className='px-3 py-2'>
                    <div className='flex flex-wrap gap-2'>
                      {emp && canEditStaff(emp) && (
                        <button type='button' onClick={() => startEditStaff(emp)}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'>
                          {t('ops.staff.actions.editStaff')}
                        </button>
                      )}
                      {u && canEditAccount(u) && (
                        <button type='button' onClick={() => startEditAccount(u)}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'>
                          {t('ops.staff.actions.editAccount')}
                        </button>
                      )}
                      {u && canReset(u) && (
                        <button type='button' onClick={() => startReset(u)}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'>
                          {t('ops.staff.actions.resetPassword')}
                        </button>
                      )}
                      {emp && canCreateLoginFor(emp) && (
                        <button type='button' onClick={() => startCreateLogin(emp)}
                          className='rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50'>
                          {t('ops.staff.actions.createLogin')}
                        </button>
                      )}
                      {emp && canDeactivateStaff(emp) && (
                        <button type='button' onClick={() => setDeactivating(emp)}
                          className='rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50'>
                          {t('ops.staff.actions.deactivate')}
                        </button>
                      )}
                      {!emp && u && canToggleActive(u) && (
                        <button type='button' onClick={() => setTogglingUser(u)}
                          className='rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50'>
                          {u.isActive ? t('action.deactivate') : t('action.reactivate')}
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

      {deactivating && (
        <div className='fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl border border-slate-200 p-5 max-w-md w-full space-y-4'>
            <h3 className='text-base font-medium text-slate-900'>{t('ops.staff.deactivateHeading')}</h3>
            <p className='text-sm text-slate-700'>{t('ops.staff.deactivateConfirm')}</p>
            <p className='text-sm font-medium text-slate-900'>{deactivating.fullName}</p>
            <div className='flex gap-2 justify-end'>
              <button type='button' onClick={confirmDeactivate} disabled={deactivateBusy}
                className='rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
                {deactivateBusy ? t('ops.staff.actions.deactivating') : t('ops.staff.actions.deactivate')}
              </button>
              <button type='button' onClick={() => setDeactivating(null)}
                className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
                {t('ops.staff.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {togglingUser && (
        <div className='fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl border border-slate-200 p-5 max-w-md w-full space-y-4'>
            <h3 className='text-base font-medium text-slate-900'>
              {togglingUser.isActive ? t('ops.staff.deactivateAccountHeading') : t('ops.staff.reactivateAccountHeading')}
            </h3>
            <p className='text-sm text-slate-700'>{togglingUser.username}</p>
            <div className='flex gap-2 justify-end'>
              <button type='button' onClick={confirmToggleUser} disabled={togglingBusy}
                className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
                {togglingBusy ? t('common.loading') : t('action.confirm')}
              </button>
              <button type='button' onClick={() => setTogglingUser(null)}
                className='rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </OpsShell>
  );
}