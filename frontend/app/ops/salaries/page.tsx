'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'APPROVED', 'PAID'] as const;

type Employee = {
  id: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  isActive?: boolean;
};

type Salary = {
  id: string;
  salaryNumber: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  baseSalary: string;
  adjustments: string;
  deductions: string;
  netSalary: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  approvedBy: string | null;
  approvedAt: string | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function employeeName(e: Employee | undefined): string {
  if (!e) return '—';
  if (e.fullName) return e.fullName;
  if (e.firstName || e.lastName) return `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim();
  return e.employeeNumber ?? e.id.slice(0, 8);
}

export default function SalariesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');

  const [employeeId, setEmployeeId] = useState('');
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [label, setLabel] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [adjustments, setAdjustments] = useState('');
  const [deductions, setDeductions] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    if (filterEmployeeId) params.set('employeeId', filterEmployeeId);
    const qs = params.toString();
    apiFetch<{ success: true; salaries: Salary[] }>(`/api/v1/salaries${qs ? '?' + qs : ''}`)
      .then((r) => setSalaries(r.salaries))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<{ success: true; employees: Employee[] }>('/api/v1/employees')
      .then((r) => setEmployees(r.employees))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterStatus, filterEmployeeId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/salaries', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          periodStart,
          periodEnd,
          label,
          baseSalary,
          adjustments: adjustments.trim() === '' ? undefined : adjustments.trim(),
          deductions: deductions.trim() === '' ? undefined : deductions.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      setLabel('');
      setBaseSalary('');
      setAdjustments('');
      setDeductions('');
      setNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  function employeeOf(id: string): Employee | undefined {
    return employees.find((e) => e.id === id);
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Salaries"
        subtitle="Per-employee salary records. DRAFT → APPROVED → PAID. Payments are partial; last payment flips to PAID."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="w-44">
          <SelectField
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <div className="w-72">
          <SelectField
            label="Employee"
            value={filterEmployeeId}
            onChange={setFilterEmployeeId}
            options={[
              { value: '', label: '— all employees —' },
              ...employees.map((e) => ({ value: e.id, label: employeeName(e) })),
            ]}
          />
        </div>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">New salary record</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <SelectField
            label="Employee"
            value={employeeId}
            onChange={setEmployeeId}
            required
            options={[
              { value: '', label: '— select —' },
              ...employees.map((e) => ({ value: e.id, label: employeeName(e) })),
            ]}
          />
          <TextField
            label="Label"
            value={label}
            onChange={setLabel}
            required
            placeholder="e.g. Sept 2026 salary"
          />
          <DateField label="Period start" value={periodStart} onChange={setPeriodStart} required />
          <DateField label="Period end" value={periodEnd} onChange={setPeriodEnd} required />
          <DecimalField label="Base salary" value={baseSalary} onChange={setBaseSalary} required placeholder="0.00" />
          <DecimalField label="Adjustments" value={adjustments} onChange={setAdjustments} placeholder="0.00" />
          <DecimalField label="Deductions" value={deductions} onChange={setDeductions} placeholder="0.00" />
        </div>
        <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />
        <div className="text-xs text-slate-500">
          Net salary = base + adjustments − deductions, computed server-side.
          Periods may not overlap for the same employee.
        </div>
        {err && <FormError code={err.code} message={err.message} />}
        <SubmitButton busy={busy}>Create salary record</SubmitButton>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Salary #</th>
              <th className="text-left px-3 py-2 font-medium">Employee</th>
              <th className="text-left px-3 py-2 font-medium">Period</th>
              <th className="text-left px-3 py-2 font-medium">Label</th>
              <th className="text-right px-3 py-2 font-medium">Net</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && salaries.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No salary records.</td></tr>
            )}
            {salaries.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{s.salaryNumber}</td>
                <td className="px-3 py-2">{employeeName(employeeOf(s.employeeId))}</td>
                <td className="px-3 py-2 text-slate-600">{s.periodStart} → {s.periodEnd}</td>
                <td className="px-3 py-2 text-slate-600">{s.label}</td>
                <td className="px-3 py-2 text-right font-mono">{s.netSalary}</td>
                <td className="px-3 py-2">
                  <span className="text-xs rounded bg-slate-100 px-2 py-0.5">{s.status}</span>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/ops/salaries/${s.id}`}
                    className="text-xs text-slate-700 underline hover:text-slate-900"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}