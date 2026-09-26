'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type Employee = {
  id: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
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
  notes: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type Payment = {
  id: string;
  salaryRecordId: string;
  amount: string;
  paymentMethod: string;
  businessDate: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  recordedBy: string;
  voidedAt: string | null;
  voidReason: string | null;
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

export default function SalaryDetailPage() {
  const params = useParams<{ id: string }>();
  const salaryId = params.id;

  const [salary, setSalary] = useState<Salary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [editLabel, setEditLabel] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editBase, setEditBase] = useState('');
  const [editAdj, setEditAdj] = useState('');
  const [editDed, setEditDed] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payBusinessDate, setPayBusinessDate] = useState(todayISO());
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    setErr(null);
    Promise.all([
      apiFetch<{ success: true; salary: Salary }>(`/api/v1/salaries/${salaryId}`),
      apiFetch<{ success: true; payments: Payment[] }>(
        `/api/v1/salary-payments?salaryRecordId=${salaryId}&includeVoided=true`
      ),
      apiFetch<{ success: true; employees: Employee[] }>('/api/v1/employees'),
    ])
      .then(([sRes, pRes, eRes]) => {
        setSalary(sRes.salary);
        setPayments(pRes.payments);
        setEmployees(eRes.employees);
        setEditLabel(sRes.salary.label);
        setEditStart(sRes.salary.periodStart);
        setEditEnd(sRes.salary.periodEnd);
        setEditBase(sRes.salary.baseSalary);
        setEditAdj(sRes.salary.adjustments);
        setEditDed(sRes.salary.deductions);
        setEditNotes(sRes.salary.notes ?? '');
      })
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [salaryId]);

  function employeeOf(id: string): Employee | undefined {
    return employees.find((e) => e.id === id);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/salaries/${salaryId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: editLabel,
          periodStart: editStart,
          periodEnd: editEnd,
          baseSalary: editBase,
          adjustments: editAdj.trim() === '' ? undefined : editAdj.trim(),
          deductions: editDed.trim() === '' ? undefined : editDed.trim(),
          notes: editNotes.trim() === '' ? null : editNotes.trim(),
        }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/salaries/${salaryId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/salary-payments', {
        method: 'POST',
        body: JSON.stringify({
          salaryRecordId: salaryId,
          amount: payAmount,
          paymentMethod: payMethod,
          businessDate: payBusinessDate,
          reference: payReference.trim() === '' ? null : payReference.trim(),
          notes: payNotes.trim() === '' ? null : payNotes.trim(),
        }),
      });
      setPayAmount('');
      setPayReference('');
      setPayNotes('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment() {
    if (!voidId) return;
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/salary-payments/${voidId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidId(null);
      setVoidReason('');
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <OpsShell>
        <OpsHeader title="Salary" />
        <div className="text-slate-500">Loading…</div>
      </OpsShell>
    );
  }

  if (!salary) {
    return (
      <OpsShell>
        <OpsHeader title="Salary" />
        {err && <FormError code={err.code} message={err.message} />}
        <Link href="/ops/salaries" className="text-sm text-slate-700 underline">← Back to list</Link>
      </OpsShell>
    );
  }

  const isDraft = salary.status === 'DRAFT';
  const isApproved = salary.status === 'APPROVED';
  const isPaid = salary.status === 'PAID';
  const activePayments = payments.filter((p) => !p.voidedAt);
  const paidTotal = activePayments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const netNum = parseFloat(salary.netSalary);
  const remaining = netNum - paidTotal;

  return (
    <OpsShell>
      <OpsHeader
        title={`Salary ${salary.salaryNumber}`}
        subtitle={`${employeeName(employeeOf(salary.employeeId))} — ${salary.status}`}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/ops/salaries" className="text-slate-500 hover:text-slate-900">← All salaries</Link>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{salary.status}</span>
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      {/* Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div><span className="text-slate-500">Employee: </span>{employeeName(employeeOf(salary.employeeId))}</div>
          <div><span className="text-slate-500">Period: </span>{salary.periodStart} → {salary.periodEnd}</div>
          <div><span className="text-slate-500">Label: </span>{salary.label}</div>
          <div><span className="text-slate-500">Base: </span><span className="font-mono">{salary.baseSalary}</span></div>
          <div><span className="text-slate-500">Adjustments: </span><span className="font-mono">{salary.adjustments}</span></div>
          <div><span className="text-slate-500">Deductions: </span><span className="font-mono">{salary.deductions}</span></div>
          <div><span className="text-slate-500">Net: </span><span className="font-mono font-medium">{salary.netSalary}</span></div>
          <div><span className="text-slate-500">Paid: </span><span className="font-mono">{paidTotal.toFixed(2)}</span></div>
          <div><span className="text-slate-500">Remaining: </span><span className="font-mono">{remaining.toFixed(2)}</span></div>
        </div>
        {salary.notes && <div className="text-sm text-slate-600">{salary.notes}</div>}
        {salary.approvedAt && (
          <div className="text-xs text-slate-500">Approved at {salary.approvedAt}</div>
        )}
      </div>

      {/* Edit form — DRAFT only */}
      {isDraft && (
        <form onSubmit={saveEdit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-700">Edit (DRAFT only)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <TextField label="Label" value={editLabel} onChange={setEditLabel} required />
            <DateField label="Period start" value={editStart} onChange={setEditStart} required />
            <DateField label="Period end" value={editEnd} onChange={setEditEnd} required />
            <DecimalField label="Base salary" value={editBase} onChange={setEditBase} required />
            <DecimalField label="Adjustments" value={editAdj} onChange={setEditAdj} />
            <DecimalField label="Deductions" value={editDed} onChange={setEditDed} />
          </div>
          <TextArea label="Notes" value={editNotes} onChange={setEditNotes} rows={2} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Approve
            </button>
          </div>
          <div className="text-xs text-slate-500">
            The creating user cannot approve their own salary record — a different
            MANAGER or OWNER must approve it. (Salaries have no OWNER self-approval
            exception, unlike expenses.) Once approved, the record is read-only.
          </div>
        </form>
      )}

      {/* Payment form — APPROVED only */}
      {isApproved && (
        <form onSubmit={pay} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-700">Record payment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <DecimalField label="Amount" value={payAmount} onChange={setPayAmount} required placeholder="0.00" />
            <SelectField
              label="Payment method"
              value={payMethod}
              onChange={setPayMethod}
              required
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
            />
            <DateField label="Business date" value={payBusinessDate} onChange={setPayBusinessDate} required />
            <TextField label="Reference (optional)" value={payReference} onChange={setPayReference} />
          </div>
          <TextArea label="Notes (optional)" value={payNotes} onChange={setPayNotes} rows={2} />
          <div className="text-xs text-slate-500">
            Partial payments are allowed. The last payment that fully covers net salary flips the status to PAID.
            Overpayment is rejected. Closed-day guard applies (MANAGER blocked, OWNER allowed).
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </form>
      )}

      {/* Payments table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Payments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Date</th>
                <th className="text-left px-2 py-2 font-medium">Method</th>
                <th className="text-right px-2 py-2 font-medium w-32">Amount</th>
                <th className="text-left px-2 py-2 font-medium">Reference</th>
                <th className="text-left px-2 py-2 font-medium">Status</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-slate-400">No payments yet.</td></tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-2 py-2">{p.businessDate}</td>
                  <td className="px-2 py-2">{p.paymentMethod}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.amount}</td>
                  <td className="px-2 py-2 text-slate-500">{p.reference ?? '—'}</td>
                  <td className="px-2 py-2">
                    {p.voidedAt
                      ? <span className="text-xs rounded bg-red-100 text-red-700 px-2 py-0.5">VOIDED</span>
                      : <span className="text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5">ACTIVE</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {!p.voidedAt && !isPaid && (
                      voidId === p.id ? (
                        <div className="space-y-1">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            placeholder="Reason"
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                          />
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              onClick={voidPayment}
                              disabled={voidReason.trim().length < 3 || busy}
                              className="text-xs rounded bg-red-600 text-white px-2 py-1 disabled:opacity-60"
                            >
                              Void
                            </button>
                            <button
                              type="button"
                              onClick={() => { setVoidId(null); setVoidReason(''); }}
                              className="text-xs text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setVoidId(p.id); setVoidReason(''); }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Void
                        </button>
                      )
                    )}
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