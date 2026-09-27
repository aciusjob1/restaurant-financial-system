'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

type Position = {
  id: string;
  name: string;
  isActive: boolean;
};

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [positionId, setPositionId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch<{ success: true; employees: Employee[] }>('/api/v1/employees'),
      apiFetch<{ success: true; positions: Position[] }>('/api/v1/positions'),
    ])
      .then(([empRes, posRes]) => {
        setEmployees(empRes.employees);
        setPositions(posRes.positions);
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function positionName(id: string): string {
    const p = positions.find((x) => x.id === id);
    return p ? p.name : id.slice(0, 8);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/employees', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          phone: phone.trim() === '' ? null : phone.trim(),
          positionId,
          startDate,
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setFullName('');
      setPhone('');
      setNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(emp: Employee) {
    setErr(null);
    setRowBusy(emp.id);
    try {
      await apiFetch(`/api/v1/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !emp.isActive }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setRowBusy(null);
    }
  }

  const visible = includeInactive ? employees : employees.filter((e) => e.isActive);
  const activePositions = positions.filter((p) => p.isActive);

  return (
    <OpsShell>
      <OpsHeader
        title="Employees"
        subtitle="Staff records used in salary and operational workflows. Not linked to login accounts yet."
      />

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">New employee</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <TextField
            label="Full name"
            value={fullName}
            onChange={setFullName}
            required
            placeholder="e.g. Asha Mwangi"
          />
          <TextField
            label="Phone (optional)"
            value={phone}
            onChange={setPhone}
            placeholder="+255..."
          />
          <SelectField
            label="Position"
            value={positionId}
            onChange={setPositionId}
            required
            options={[
              { value: '', label: '— select —' },
              ...activePositions.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <DateField
            label="Start date"
            value={startDate}
            onChange={setStartDate}
            required
          />
        </div>
        <TextArea
          label="Notes (optional)"
          value={notes}
          onChange={setNotes}
          rows={2}
        />
        {err && <FormError code={err.code} message={err.message} />}
        <SubmitButton busy={busy}>Create employee</SubmitButton>
        {activePositions.length === 0 && (
          <div className="text-xs text-amber-700">
            No active positions. Create a position first at /ops/positions.
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-xs text-slate-500">{visible.length} employee(s)</span>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Include inactive
          </label>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Position</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium">Start</th>
              <th className="text-left px-3 py-2 font-medium">Employment</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No employees.</td></tr>
            )}
            {visible.map((emp) => (
              <tr key={emp.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-slate-500">{emp.employeeNumber}</td>
                <td className="px-3 py-2">{emp.fullName}</td>
                <td className="px-3 py-2">{positionName(emp.positionId)}</td>
                <td className="px-3 py-2 text-slate-600">{emp.phone ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{emp.startDate}</td>
                <td className="px-3 py-2">
                  <span className="text-xs rounded bg-slate-100 px-2 py-0.5">{emp.employmentStatus}</span>
                </td>
                <td className="px-3 py-2">
                  {emp.isActive
                    ? <span className="text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5">ACTIVE</span>
                    : <span className="text-xs rounded bg-slate-100 text-slate-500 px-2 py-0.5">INACTIVE</span>}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(emp)}
                    disabled={rowBusy === emp.id}
                    className={
                      'text-xs underline disabled:opacity-60 ' +
                      (emp.isActive ? 'text-red-600 hover:text-red-800' : 'text-emerald-700 hover:text-emerald-900')
                    }
                  >
                    {rowBusy === emp.id ? '…' : (emp.isActive ? 'Deactivate' : 'Reactivate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}