'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import {
  DateField, DecimalField, TextField, FormError, SubmitButton,
} from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

const PAYMENT_METHODS = [
  'CASH', 'MPESA', 'AIRTEL_MONEY', 'TIGO_PESA',
  'HALOPESA', 'BANK', 'CARD', 'OTHER',
] as const;

type SalesSummary = {
  id: string;
  businessDate: string;
  source: string;
  sourceReference: string;
  status: 'DRAFT' | 'VERIFIED';
  totalSales: string;
  cashSales: string;
  mobileSales: string;
  otherSales: string;
  createdAt: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function SalesPage() {
  const [summaries, setSummaries] = useState<SalesSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [sourceReference, setSourceReference] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function refresh() {
    setLoading(true);
    apiFetch<{ success: true; summaries: SalesSummary[] }>('/api/v1/sales-summaries')
      .then((r) => setSummaries(r.summaries))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const lines = PAYMENT_METHODS
      .filter((m) => (amounts[m] ?? '').trim() !== '')
      .map((m) => ({ paymentMethod: m, amount: amounts[m].trim() }));

    if (lines.length === 0) {
      setErr({ code: 'EMPTY', message: 'Enter at least one payment method amount.' });
      return;
    }

    setBusy(true);
    try {
      await apiFetch('/api/v1/sales-summaries', {
        method: 'POST',
        body: JSON.stringify({ businessDate, sourceReference, lines }),
      });
      setAmounts({});
      setSourceReference('');
      refresh();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsShell>
      <OpsHeader
        title="Sales"
        subtitle="Record a manual daily sales summary. One line per payment method."
      />

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DateField
            label="Business date"
            value={businessDate}
            onChange={setBusinessDate}
            required
          />
          <TextField
            label="Source reference (optional)"
            value={sourceReference}
            onChange={setSourceReference}
            placeholder="e.g. POS slip #"
          />
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Amounts by payment method</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {PAYMENT_METHODS.map((m) => (
              <DecimalField
                key={m}
                label={m.replace(/_/g, ' ')}
                value={amounts[m] ?? ''}
                onChange={(v) => setAmounts((prev) => ({ ...prev, [m]: v }))}
                placeholder="0.00"
              />
            ))}
          </div>
        </div>

        {err && <FormError code={err.code} message={err.message} />}
        <SubmitButton busy={busy}>Record sales summary</SubmitButton>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Source</th>
              <th className="text-right px-3 py-2 font-medium">Total</th>
              <th className="text-right px-3 py-2 font-medium">Cash</th>
              <th className="text-right px-3 py-2 font-medium">Mobile</th>
              <th className="text-right px-3 py-2 font-medium">Other</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && summaries.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No summaries yet.</td></tr>
            )}
            {summaries.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{s.businessDate}</td>
                <td className="px-3 py-2 text-slate-600">
                  {s.source}{s.sourceReference ? ' — ' + s.sourceReference : ''}
                </td>
                <td className="px-3 py-2 text-right font-mono">{s.totalSales}</td>
                <td className="px-3 py-2 text-right font-mono">{s.cashSales}</td>
                <td className="px-3 py-2 text-right font-mono">{s.mobileSales}</td>
                <td className="px-3 py-2 text-right font-mono">{s.otherSales}</td>
                <td className="px-3 py-2">
                  <span className="text-xs rounded bg-slate-100 px-2 py-0.5">{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}