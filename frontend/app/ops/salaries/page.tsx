'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, SelectField, TextField, TextArea, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n/LanguageContext';
import type { Dict } from '@/lib/i18n/dictionaries';

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'APPROVED', 'PAID'] as const;
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
  isActive?: boolean;
};

type UnsettledAdvance = { id: string; amount: string; businessDate: string };

type SettledAdvance = {
  id: string;
  amount: string;
  businessDate: string;
  settledAt: string | null;
  salaryNumber: string | null;
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
  paidTotal?: string;
  unsettledAdvances?: UnsettledAdvance[];
  settledAdvances?: SettledAdvance[];
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
  source: 'PAYROLL' | 'KIOSK';
  recordedBy: string;
  voidedAt: string | null;
  voidReason: string | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '\u2014';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function employeeName(e: Employee | undefined): string {
  if (!e) return '\u2014';
  if (e.fullName) return e.fullName;
  if (e.firstName || e.lastName) return ((e.firstName ?? '') + ' ' + (e.lastName ?? '')).trim();
  return e.employeeNumber ?? e.id.slice(0, 8);
}

function salaryStatusKey(s: string): keyof Dict {
  if (s === 'APPROVED') return 'status.approved';
  if (s === 'PAID') return 'status.paid';
  return 'status.draft';
}

function salaryStatusFilterKey(s: string): keyof Dict {
  if (s === 'ALL') return 'status.all';
  if (s === 'APPROVED') return 'status.approved';
  if (s === 'PAID') return 'status.paid';
  return 'status.draft';
}

function paidOf(s: Salary): number {
  return parseFloat(s.paidTotal ?? '0') || 0;
}

function remainingOf(s: Salary): number {
  return (parseFloat(s.netSalary) || 0) - paidOf(s);
}

export default function SalariesPage() {
  const { t, tError } = useT();
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

  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'ALL') params.set('status', filterStatus);
    if (filterEmployeeId) params.set('employeeId', filterEmployeeId);
    const qs = params.toString();
    apiFetch<{ success: true; salaries: Salary[] }>('/api/v1/salaries' + (qs ? '?' + qs : ''))
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

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  const baseNum = parseFloat(baseSalary);
  const adjNum = parseFloat(adjustments) || 0;
  const dedNum = parseFloat(deductions) || 0;
  const previewNet =
    baseSalary.trim() !== '' && Number.isFinite(baseNum)
      ? (baseNum + adjNum - dedNum).toFixed(2)
      : null;

  return (
    <OpsShell>
      <OpsHeader
        title={t('ops.salaries.title')}
        subtitle={t('ops.salaries.subtitle')}
      />

      <div className='flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4'>
        <div className='w-44'>
          <SelectField
            label={t('table.status')}
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: t(salaryStatusFilterKey(s)) }))}
          />
        </div>
        <div className='w-72'>
          <SelectField
            label={t('table.employee')}
            value={filterEmployeeId}
            onChange={setFilterEmployeeId}
            options={[
              { value: '', label: t('common.allEmployees') },
              ...employees.map((e) => ({ value: e.id, label: employeeName(e) })),
            ]}
          />
        </div>
      </div>

      <form onSubmit={submit} className='rounded-2xl border border-slate-200 bg-white p-5 space-y-4'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.salaries.newHeading')}</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          <SelectField
            label={t('table.employee')}
            value={employeeId}
            onChange={setEmployeeId}
            required
            options={[
              { value: '', label: t('form.selectPrompt') },
              ...employees.map((e) => ({ value: e.id, label: employeeName(e) })),
            ]}
          />
          <TextField
            label={t('form.label')}
            value={label}
            onChange={setLabel}
            required
            placeholder={t('ops.salaries.labelPlaceholder')}
          />
          <DateField
            label={t('form.periodStart')}
            value={periodStart}
            onChange={setPeriodStart}
            required
            hint={t('ops.salaries.hint.period')}
          />
          <DateField label={t('form.periodEnd')} value={periodEnd} onChange={setPeriodEnd} required />
          <DecimalField
            label={t('form.baseSalary')}
            value={baseSalary}
            onChange={setBaseSalary}
            required
            placeholder='0.00'
            hint={t('ops.salaries.hint.baseSalary')}
          />
          <DecimalField
            label={t('form.adjustments')}
            value={adjustments}
            onChange={setAdjustments}
            placeholder='0.00'
            hint={t('ops.salaries.hint.adjustments')}
          />
          <DecimalField
            label={t('form.deductions')}
            value={deductions}
            onChange={setDeductions}
            placeholder='0.00'
            hint={t('ops.salaries.hint.deductions')}
          />
        </div>
        <TextArea
          label={t('form.notesOptional')}
          value={notes}
          onChange={setNotes}
          rows={2}
          hint={t('ops.salaries.hint.notes')}
        />
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm'>
          <span className='text-slate-600'>{t('ops.salaries.netPreview')}</span>
          <span className='font-mono font-medium text-slate-900'>{previewNet ?? '\u2014'}</span>
        </div>
        <div className='text-xs text-slate-500'>
          {t('ops.salaries.note')}
        </div>
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        <SubmitButton busy={busy}>{t('action.createSalary')}</SubmitButton>
      </form>

      <div className='rounded-2xl border border-slate-200 bg-white p-4'>
        <h2 className='text-sm font-medium text-slate-700'>{t('ops.salaries.flowHeading')}</h2>
        <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-3'>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <span className='text-xs font-medium rounded bg-slate-200 text-slate-700 px-2 py-0.5'>
              {t('status.draft')}
            </span>
            <p className='mt-2 text-sm text-slate-600'>{t('ops.salaries.flowDraft')}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <span className='text-xs font-medium rounded bg-slate-200 text-slate-700 px-2 py-0.5'>
              {t('status.approved')}
            </span>
            <p className='mt-2 text-sm text-slate-600'>{t('ops.salaries.flowApproved')}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <span className='text-xs font-medium rounded bg-slate-200 text-slate-700 px-2 py-0.5'>
              {t('status.paid')}
            </span>
            <p className='mt-2 text-sm text-slate-600'>{t('ops.salaries.flowPaid')}</p>
          </div>
        </div>
      </div>

      <div className='rounded-2xl border border-slate-200 bg-white overflow-hidden'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='w-8' />
              <th className='text-left px-3 py-2 font-medium'>{t('table.salaryNumber')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.employee')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.period')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.label')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('table.net')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('ops.salaries.paidCol')}</th>
              <th className='text-right px-3 py-2 font-medium'>{t('ops.salaries.remainingCol')}</th>
              <th className='text-left px-3 py-2 font-medium'>{t('table.status')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className='px-3 py-6 text-center text-slate-400'>{t('common.loading')}</td></tr>
            )}
            {!loading && salaries.length === 0 && (
              <tr><td colSpan={9} className='px-3 py-6 text-center text-slate-400'>{t('ops.salaries.empty')}</td></tr>
            )}
            {salaries.map((s) => {
              const isOpen = expandedId === s.id;
              const paid = paidOf(s);
              const remaining = remainingOf(s);
              return (
                <Fragment key={s.id}>
                  <tr className='border-t border-slate-100 hover:bg-slate-50'>
                    <td className='px-2 py-2 text-center'>
                      <button
                        type='button'
                        onClick={() => toggleExpand(s.id)}
                        className='text-slate-500 hover:text-slate-900'
                        aria-label={isOpen ? 'Collapse' : 'Expand'}
                      >
                        {isOpen ? '\u2212' : '+'}
                      </button>
                    </td>
                    <td className='px-3 py-2 font-mono'>{s.salaryNumber}</td>
                    <td className='px-3 py-2'>{employeeName(employeeOf(s.employeeId))}</td>
                    <td className='px-3 py-2 text-slate-600'>{s.periodStart} {'\u2192'} {s.periodEnd}</td>
                    <td className='px-3 py-2 text-slate-600'>{s.label}</td>
                    <td className='px-3 py-2 text-right font-mono'>{s.netSalary}</td>
                    <td className='px-3 py-2 text-right font-mono'>{paid.toFixed(2)}</td>
                    <td className='px-3 py-2 text-right font-mono'>{remaining.toFixed(2)}</td>
                    <td className='px-3 py-2'>
                      <span className='text-xs rounded bg-slate-100 px-2 py-0.5'>{t(salaryStatusKey(s.status))}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={s.id + '-detail'} className='border-t border-slate-100 bg-slate-50'>
                      <td colSpan={9} className='p-0'>
                        <SalaryExpanded record={s} employees={employees} onChanged={load} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}

// ---------- expanded panel ----------

function SalaryExpanded({ record, employees, onChanged }: { record: Salary; employees: Employee[]; onChanged: () => void }) {
  const { t, tError } = useT();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [advances, setAdvances] = useState<UnsettledAdvance[]>([]);
  const [settledAdvances, setSettledAdvances] = useState<SettledAdvance[]>([]);

  const [editLabel, setEditLabel] = useState(record.label);
  const [editStart, setEditStart] = useState(record.periodStart);
  const [editEnd, setEditEnd] = useState(record.periodEnd);
  const [editBase, setEditBase] = useState(record.baseSalary);
  const [editAdj, setEditAdj] = useState(record.adjustments);
  const [editDed, setEditDed] = useState(record.deductions);
  const [editNotes, setEditNotes] = useState(record.notes ?? '');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>('CASH');
  const [payBusinessDate, setPayBusinessDate] = useState(todayISO());
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const isDraft = record.status === 'DRAFT';
  const isApproved = record.status === 'APPROVED';
  const isPaid = record.status === 'PAID';
  const paidTotal = parseFloat(record.paidTotal ?? '0') || 0;
  const netNum = parseFloat(record.netSalary) || 0;
  const remaining = netNum - paidTotal;

  function reloadPayments() {
    setLoadingPayments(true);
    apiFetch<{ success: true; payments: Payment[] }>(
      '/api/v1/salary-payments?salaryRecordId=' + record.id + '&includeVoided=true'
    )
      .then((r) => setPayments(r.payments))
      .catch(() => setPayments([]))
      .finally(() => setLoadingPayments(false));
  }

  useEffect(() => { reloadPayments(); }, [record.id]);

  useEffect(() => {
    apiFetch<{ success: true; salary: Salary }>('/api/v1/salaries/' + record.id)
      .then((r) => {
        setAdvances(r.salary.unsettledAdvances ?? []);
        setSettledAdvances(r.salary.settledAdvances ?? []);
      })
      .catch(() => {
        setAdvances([]);
        setSettledAdvances([]);
      });
  }, [record.id]);

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await apiFetch('/api/v1/salaries/' + record.id, {
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
      onChanged();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setErr(null); setBusy(true);
    try {
      await apiFetch('/api/v1/salaries/' + record.id + '/approve', {
        method: 'POST', body: JSON.stringify({}),
      });
      onChanged();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await apiFetch('/api/v1/salary-payments', {
        method: 'POST',
        body: JSON.stringify({
          salaryRecordId: record.id,
          amount: payAmount,
          paymentMethod: payMethod,
          businessDate: payBusinessDate,
          reference: payReference.trim() === '' ? null : payReference.trim(),
          notes: payNotes.trim() === '' ? null : payNotes.trim(),
        }),
      });
      setPayAmount(''); setPayReference(''); setPayNotes('');
      reloadPayments();
      onChanged();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment() {
    if (!voidId) return;
    setErr(null); setBusy(true);
    try {
      await apiFetch('/api/v1/salary-payments/' + voidId + '/void', {
        method: 'POST', body: JSON.stringify({ reason: voidReason }),
      });
      setVoidId(null); setVoidReason('');
      reloadPayments();
      onChanged();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='p-5 space-y-4'>
      {/* Summary */}
      <div className='rounded-xl border border-slate-200 bg-white p-4 space-y-3'>
        <h3 className='text-sm font-medium text-slate-700'>{t('ops.salaries.summaryHeading')}</h3>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-3 text-sm'>
          <div><span className='text-slate-500'>{t('table.employee')}: </span>{employeeName(employees.find((e) => e.id === record.employeeId))}</div>
          <div><span className='text-slate-500'>{t('table.period')}: </span>{record.periodStart} {'\u2192'} {record.periodEnd}</div>
          <div><span className='text-slate-500'>{t('form.label')}: </span>{record.label}</div>
          <div><span className='text-slate-500'>{t('form.baseSalary')}: </span><span className='font-mono'>{record.baseSalary}</span></div>
          <div><span className='text-slate-500'>{t('form.adjustments')}: </span><span className='font-mono'>{record.adjustments}</span></div>
          <div><span className='text-slate-500'>{t('form.deductions')}: </span><span className='font-mono'>{record.deductions}</span></div>
          <div><span className='text-slate-500'>{t('table.net')}: </span><span className='font-mono font-medium'>{record.netSalary}</span></div>
          <div><span className='text-slate-500'>{t('ops.salaries.paidCol')}: </span><span className='font-mono'>{paidTotal.toFixed(2)}</span></div>
          <div><span className='text-slate-500'>{t('ops.salaries.remainingCol')}: </span><span className='font-mono'>{remaining.toFixed(2)}</span></div>
        </div>
        {record.notes && <div className='text-sm text-slate-600'>{record.notes}</div>}
        {record.approvedAt && (
          <div className='text-xs text-slate-500'>{t('ops.salaries.approvedAtPrefix')}{formatDateTime(record.approvedAt)}</div>
        )}
      </div>

      {/* Unsettled advances */}
      {advances.length > 0 && (
        <div className='rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1 text-sm'>
          <div className='font-medium text-amber-900'>{t('ops.salaries.advanceHeading')}</div>
          <div className='text-amber-800'>{t('ops.salaries.advanceIntro')}</div>
          <ul className='font-mono text-amber-900'>
            {advances.map((a) => (
              <li key={a.id}>{a.businessDate} {'\u2014'} {a.amount}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Settled advances (read-only history) */}
      {settledAdvances.length > 0 && (
        <div className='rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1 text-sm'>
          <div className='font-medium text-slate-700'>{t('ops.salaries.settledAdvanceHeading')}</div>
          <div className='text-slate-600'>{t('ops.salaries.settledAdvanceIntro')}</div>
          <ul className='font-mono text-slate-700'>
            {settledAdvances.map((a) => (
              <li key={a.id}>
                {a.businessDate} {'\u2014'} {a.amount}
                <span className='font-sans text-xs text-slate-500'>
                  {' \u00b7 '}{t('ops.salaries.settledAdvanceAbsorbedBy')}{' '}
                  {a.salaryNumber ?? '\u2014'}
                  {a.settledAt ? ' \u00b7 ' + formatDateTime(a.settledAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Edit form — DRAFT only */}
      {isDraft && (
        <form onSubmit={saveEdit} className='rounded-xl border border-slate-200 bg-white p-4 space-y-3'>
          <h3 className='text-sm font-medium text-slate-700'>{t('ops.salaries.editHeading')}</h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <TextField label={t('form.label')} value={editLabel} onChange={setEditLabel} required />
            <DateField label={t('form.periodStart')} value={editStart} onChange={setEditStart} required hint={t('ops.salaries.hint.period')} />
            <DateField label={t('form.periodEnd')} value={editEnd} onChange={setEditEnd} required />
            <DecimalField label={t('form.baseSalary')} value={editBase} onChange={setEditBase} required hint={t('ops.salaries.hint.baseSalary')} />
            <DecimalField label={t('form.adjustments')} value={editAdj} onChange={setEditAdj} hint={t('ops.salaries.hint.adjustments')} />
            <DecimalField label={t('form.deductions')} value={editDed} onChange={setEditDed} hint={t('ops.salaries.hint.deductions')} />
          </div>
          <TextArea label={t('form.notesOptional')} value={editNotes} onChange={setEditNotes} rows={2} hint={t('ops.salaries.hint.notes')} />
          <div className='flex flex-wrap gap-2'>
            <button type='submit' disabled={busy} className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
              {busy ? t('ops.salaries.saving') : t('ops.salaries.saveChanges')}
            </button>
            <button type='button' onClick={approve} disabled={busy} className='rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
              {t('ops.salaries.approve')}
            </button>
          </div>
        </form>
      )}

      {/* Record payment — APPROVED only */}
      {isApproved && (
        <form onSubmit={pay} className='rounded-xl border border-slate-200 bg-white p-4 space-y-3'>
          <h3 className='text-sm font-medium text-slate-700'>{t('ops.salaries.recordPaymentHeading')}</h3>
          <div className='text-xs text-slate-500'>
            {t('ops.salaries.paymentHelp')} <span className='font-mono text-slate-700'>{remaining.toFixed(2)}</span>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <DecimalField label={t('form.amount')} value={payAmount} onChange={setPayAmount} required placeholder='0.00' />
            <SelectField
              label={t('form.paymentMethod')}
              value={payMethod}
              onChange={setPayMethod}
              required
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
            />
            <DateField label={t('form.businessDate')} value={payBusinessDate} onChange={setPayBusinessDate} required />
            <TextField label={t('form.referenceOptional')} value={payReference} onChange={setPayReference} />
          </div>
          <TextArea label={t('form.notesOptional')} value={payNotes} onChange={setPayNotes} rows={2} />
          <button type='submit' disabled={busy} className='rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60'>
            {busy ? t('ops.salaries.recordingPayment') : t('ops.salaries.recordPayment')}
          </button>
        </form>
      )}

      {/* Payments table */}
      <div className='rounded-xl border border-slate-200 bg-white p-4 space-y-2'>
        <h3 className='text-sm font-medium text-slate-700'>{t('ops.salaries.paymentsHeading')}</h3>
        {err && <FormError code={err.code} message={tError(err.code, err.message)} />}
        {loadingPayments ? (
          <div className='text-sm text-slate-400'>{t('common.loading')}</div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='text-left px-2 py-2 font-medium'>{t('table.date')}</th>
                  <th className='text-left px-2 py-2 font-medium'>{t('table.method')}</th>
                  <th className='text-right px-2 py-2 font-medium w-32'>{t('form.amount')}</th>
                  <th className='text-left px-2 py-2 font-medium'>{t('form.referenceOptional')}</th>
                  <th className='text-left px-2 py-2 font-medium'>{t('table.status')}</th>
                  <th className='w-24' />
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr><td colSpan={6} className='px-2 py-4 text-center text-slate-400'>{t('ops.salaries.noPayments')}</td></tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id} className='border-t border-slate-100'>
                    <td className='px-2 py-2'>{p.businessDate}</td>
                    <td className='px-2 py-2'>
                      <div>{p.paymentMethod}</div>
                      <span
                        className={
                          p.source === 'KIOSK'
                            ? 'text-[10px] uppercase tracking-wide rounded bg-sky-100 text-sky-700 px-1.5 py-0.5'
                            : 'text-[10px] uppercase tracking-wide rounded bg-slate-100 text-slate-600 px-1.5 py-0.5'
                        }
                      >
                        {p.source === 'KIOSK'
                          ? t('ops.salaries.sourceKiosk')
                          : t('ops.salaries.sourcePayroll')}
                      </span>
                    </td>
                    <td className='px-2 py-2 text-right font-mono'>{p.amount}</td>
                    <td className='px-2 py-2 text-slate-500'>{p.reference ?? '\u2014'}</td>
                    <td className='px-2 py-2'>
                      {p.voidedAt
                        ? <span className='text-xs rounded bg-red-100 text-red-700 px-2 py-0.5'>{t('status.voided')}</span>
                        : <span className='text-xs rounded bg-emerald-100 text-emerald-700 px-2 py-0.5'>{t('status.active')}</span>}
                    </td>
                    <td className='px-2 py-2 text-right'>
                      {!p.voidedAt && !isPaid && (
                        voidId === p.id ? (
                          <div className='space-y-1'>
                            <input
                              className='w-full rounded border border-slate-300 px-2 py-1 text-xs'
                              placeholder={t('ops.salaries.voidReasonPlaceholder')}
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                            />
                            <div className='flex gap-1 justify-end'>
                              <button type='button' onClick={voidPayment} disabled={voidReason.trim().length < 3 || busy} className='text-xs rounded bg-red-600 text-white px-2 py-1 disabled:opacity-60'>{t('ops.salaries.void')}</button>
                              <button type='button' onClick={() => { setVoidId(null); setVoidReason(''); }} className='text-xs text-slate-600'>{t('action.cancel')}</button>
                            </div>
                          </div>
                        ) : (
                          <button type='button' onClick={() => { setVoidId(p.id); setVoidReason(''); }} className='text-xs text-red-600 hover:text-red-800'>{t('ops.salaries.void')}</button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
