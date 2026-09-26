'use client';

// Verified against backend/src/routes/expenseRoutes.ts and
// backend/src/validators/expense.ts.
//
// State machine: DRAFT -> (submit) -> PENDING -> (approve|reject) -> terminal
// Endpoints used:
//   GET  /api/v1/expenses                list with filters
//   POST /api/v1/expenses                create (status DRAFT)
//   POST /api/v1/expenses/:id/submit     DRAFT -> PENDING
//   POST /api/v1/expenses/:id/approve    PENDING -> APPROVED
//   POST /api/v1/expenses/:id/reject     PENDING -> REJECTED (requires reason)
//   GET  /api/v1/expense-categories      dropdown source

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  TextField,
  DecimalField,
  DateField,
  SelectField,
  TextArea,
  FormError,
  SubmitButton,
} from '@/components/ops/Form';
import { ConfirmDialog } from '@/components/ops/ConfirmDialog';
import { apiFetch, ApiError } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type ExpenseCategory = { id: string; name: string; isActive: boolean };

type Expense = {
  id: string;
  expenseNumber: string;
  businessDate: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  description: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  createdBy: string;
  paidByUserId: string | null;
};

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

type ListCategoriesResponse = { success: true; categories: ExpenseCategory[] };
type ListExpensesResponse = { success: true; expenses: Expense[] };
type OneExpenseResponse = { success: true; expense: Expense };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusPill(status: string): string {
  switch (status) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-700';
    case 'PENDING':  return 'bg-amber-50 text-amber-700';
    case 'REJECTED': return 'bg-red-50 text-red-700';
    default:         return 'bg-slate-100 text-slate-600';
  }
}

function ExpensesContent() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string; username: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [includeRejected, setIncludeRejected] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paidByUserId, setPaidByUserId] = useState('');
  const [description, setDescription] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const reload = useCallback(
    async (status: string, withRejected: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const p = new URLSearchParams();
        if (status) p.set('status', status);
        p.set('includeRejected', withRejected ? 'true' : 'false');
        const res = await apiFetch<ListExpensesResponse>(OPS_PATHS.expenses + '?' + p.toString());
        setRows(res.expenses);
      } catch (e) {
        if (e instanceof ApiError) setError({ code: e.code, message: e.message });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    apiFetch<ListCategoriesResponse>(OPS_PATHS.expenseCategories)
      .then((res) => {
        setCategories(res.categories);
        if (res.categories.length > 0 && !categoryId) setCategoryId(res.categories[0].id);
      })
      .catch(() => {});
    apiFetch<MeResponse>('/api/v1/auth/me')
      .then((res) => { setMyId(res.user.id); setMyRole(res.user.role); })
      .catch(() => {});
    apiFetch<{ success: true; users: Array<{ id: string; fullName: string; username: string }> }>('/api/v1/users')
      .then((res) => setUsers(res.users))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void reload(statusFilter, includeRejected); }, [reload, statusFilter, includeRejected]);

  async function onCreate(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        businessDate,
        categoryId,
        amount: amount.trim(),
        paymentMethod,
        description: description.trim(),
      };
      if (paidByUserId) body.paidByUserId = paidByUserId;
      if (receiptNumber.trim()) body.receiptNumber = receiptNumber.trim();
      if (notes.trim()) body.notes = notes.trim();
      await apiFetch<OneExpenseResponse>(OPS_PATHS.expenses, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAmount('');
      setDescription('');
      setReceiptNumber('');
      setNotes('');
      setPaidByUserId('');
      await reload(statusFilter, includeRejected);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: 'submit' | 'approve') {
    setError(null);
    try {
      await apiFetch<OneExpenseResponse>(`${OPS_PATHS.expenses}/${id}/${action}`, {
        method: 'POST',
      });
      await reload(statusFilter, includeRejected);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setRejectBusy(true);
    setError(null);
    try {
      await apiFetch<OneExpenseResponse>(`${OPS_PATHS.expenses}/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setRejectTarget(null);
      setRejectReason('');
      await reload(statusFilter, includeRejected);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, message: e.message });
    } finally {
      setRejectBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Expenses"
        subtitle="Create, submit, approve, or reject operational expenses."
      />

      {error && <FormError code={error.code} message={error.message} />}

      {categories.length === 0 && !loading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No expense categories yet. Create one first at{' '}
          <a href="/ops/expense-categories" className="underline">/ops/expense-categories</a>.
        </div>
      )}

      <form onSubmit={onCreate} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DateField label="Business date" value={businessDate} onChange={setBusinessDate} required />
          <SelectField
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            required
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <DecimalField label="Amount" value={amount} onChange={setAmount} placeholder="0.00" required />
          <SelectField
            label="Payment method"
            value={paymentMethod}
            onChange={setPaymentMethod}
            required
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          />
          <SelectField
            label="Paid by"
            value={paidByUserId}
            onChange={setPaidByUserId}
            options={[{ value: '', label: '— not specified —' }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]}
          />
        </div>
        <TextField label="Description" value={description} onChange={setDescription} required />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField label="Receipt number" value={receiptNumber} onChange={setReceiptNumber} placeholder="Optional" />
        </div>
        <TextArea label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
        <SubmitButton busy={busy}>Create expense</SubmitButton>
      </form>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'All' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
          />
          <label className="text-sm text-slate-600 flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={includeRejected}
              onChange={(e) => setIncludeRejected(e.target.checked)}
            />
            Include rejected
          </label>
        </div>
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Method</th>
              <th className="text-left px-3 py-2 font-medium">Paid by</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">No expenses yet.</td>
              </tr>
            )}
            {rows.map((x) => (
              <tr key={x.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700">{x.businessDate}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{x.expenseNumber}</td>
                <td className="px-3 py-2 text-slate-800">{x.description}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">{x.amount}</td>
                <td className="px-3 py-2 text-slate-600">{x.paymentMethod}</td>
                <td className="px-3 py-2 text-slate-600">{users.find((u) => u.id === x.paidByUserId)?.fullName ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={'text-xs px-2 py-0.5 rounded-full ' + statusPill(x.status)}>
                    {x.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                  {x.status === 'DRAFT' && (
                    <button type="button" onClick={() => act(x.id, 'submit')} className="text-xs text-blue-700 hover:underline">
                      Submit
                    </button>
                  )}
                  {x.status === 'PENDING' && myId && x.createdBy !== myId && (
                    <>
                      <button type="button" onClick={() => act(x.id, 'approve')} className="text-xs text-emerald-700 hover:underline">
                        Approve
                      </button>
                      <button type="button" onClick={() => { setRejectTarget(x); setRejectReason(''); }} className="text-xs text-red-700 hover:underline">
                        Reject
                      </button>
                    </>
                  )}
                  {x.status === 'PENDING' && myId && x.createdBy === myId && myRole === 'OWNER' && (
                    <button type="button" onClick={() => act(x.id, 'approve')} className="text-xs text-amber-700 hover:underline">
                      Approve (self)
                    </button>
                  )}
                  {x.status === 'PENDING' && myId && x.createdBy === myId && myRole !== 'OWNER' && (
                    <span className="text-xs text-slate-400">Awaiting another approver</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={rejectTarget !== null}
        title="Reject expense"
        danger
        busy={rejectBusy}
        confirmLabel="Reject"
        body={
          <div>
            <p className="mb-2">
              Reject <span className="font-mono">{rejectTarget?.expenseNumber}</span> ({rejectTarget?.amount})?
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason (min 3 characters)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        }
        onConfirm={confirmReject}
        onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
      />
    </OpsShell>
  );
}

export default function Page() {
  return <ExpensesContent />;
}
