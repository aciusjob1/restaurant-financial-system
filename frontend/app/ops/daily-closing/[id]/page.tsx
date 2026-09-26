'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { TextArea, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

type Closing = {
  id: string;
  businessDate: string;
  version: number;
  status: 'CLOSED' | 'SUPERSEDED' | 'REOPENED';

  salesSummaryTotal: string;
  salesSummaryCash: string;
  salesSummaryMobile: string;
  salesSummaryOther: string;

  expectedCash: string;
  expectedMobile: string;
  actualCash: string;
  actualMobile: string;
  cashDifference: string;
  mobileDifference: string;

  cashSalesDiscrepancy: string;
  mobileSalesDiscrepancy: string;
  otherSalesDiscrepancy: string;

  totalHandovers: number;
  totalHandoverAmount: string;
  pendingHandoverCount: number;
  pendingHandoverAmount: string;
  confirmedHandoverCount: number;
  confirmedHandoverAmount: string;

  shiftCount: number;
  reconciliationCount: number;
  pendingReviewCount: number;

  closedBy: string;
  closedAt: string;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

type User = { id: string; fullName: string; username: string; role: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

function diffClass(v: string): string {
  const n = parseFloat(v);
  if (n === 0) return 'text-slate-500';
  return n > 0 ? 'text-emerald-700' : 'text-red-700';
}

export default function DailyClosingDetailPage() {
  const params = useParams<{ id: string }>();
  const closingId = params.id;

  const [closing, setClosing] = useState<Closing | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  function load() {
    setLoading(true);
    setErr(null);
    apiFetch<{ success: true; closing: Closing }>(`/api/v1/daily-closings/${closingId}`)
      .then((r) => setClosing(r.closing))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [closingId]);

  useEffect(() => {
    apiFetch<{ success: true; user: User }>('/api/v1/auth/me')
      .then((r) => setMyRole(r.user.role))
      .catch(() => {});
    apiFetch<{ success: true; users: User[] }>('/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  function userName(id: string): string {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName : id.slice(0, 8);
  }

  async function reopen() {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/daily-closings/${closingId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason }),
      });
      setShowReopen(false);
      setReopenReason('');
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
        <OpsHeader title="Daily Closing" />
        <div className="text-slate-500">Loading…</div>
      </OpsShell>
    );
  }

  if (!closing) {
    return (
      <OpsShell>
        <OpsHeader title="Daily Closing" />
        {err && <FormError code={err.code} message={err.message} />}
        <Link href="/ops/daily-closing" className="text-sm text-slate-700 underline">← Back to list</Link>
      </OpsShell>
    );
  }

  const canReopen = myRole === 'OWNER' && closing.status === 'CLOSED';

  return (
    <OpsShell>
      <OpsHeader
        title={`Closing ${closing.businessDate} v${closing.version}`}
        subtitle={`Status: ${closing.status}`}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/ops/daily-closing" className="text-slate-500 hover:text-slate-900">← All closings</Link>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{closing.status}</span>
        <span className="text-xs text-slate-500">
          Closed by {userName(closing.closedBy)} at {closing.closedAt}
        </span>
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      {/* Sales summary (POS view) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Sales summary (POS view)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Total</div>
            <div className="font-mono font-medium">{closing.salesSummaryTotal}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Cash</div>
            <div className="font-mono">{closing.salesSummaryCash}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Mobile</div>
            <div className="font-mono">{closing.salesSummaryMobile}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Other</div>
            <div className="font-mono">{closing.salesSummaryOther}</div>
          </div>
        </div>
      </div>

      {/* Expected vs Actual */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Expected vs actual (waiter view)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Channel</th>
                <th className="text-right px-3 py-2 font-medium">Expected</th>
                <th className="text-right px-3 py-2 font-medium">Actual</th>
                <th className="text-right px-3 py-2 font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2">Cash</td>
                <td className="px-3 py-2 text-right font-mono">{closing.expectedCash}</td>
                <td className="px-3 py-2 text-right font-mono">{closing.actualCash}</td>
                <td className={'px-3 py-2 text-right font-mono ' + diffClass(closing.cashDifference)}>{closing.cashDifference}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2">Mobile</td>
                <td className="px-3 py-2 text-right font-mono">{closing.expectedMobile}</td>
                <td className="px-3 py-2 text-right font-mono">{closing.actualMobile}</td>
                <td className={'px-3 py-2 text-right font-mono ' + diffClass(closing.mobileDifference)}>{closing.mobileDifference}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Discrepancies between POS and waiter views */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">POS ↔ waiter discrepancies</h2>
        <div className="text-xs text-slate-500">
          SalesSummary − collections-derived expected, per channel. Non-zero means POS and waiter views disagree.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Cash discrepancy</div>
            <div className={'font-mono ' + diffClass(closing.cashSalesDiscrepancy)}>{closing.cashSalesDiscrepancy}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Mobile discrepancy</div>
            <div className={'font-mono ' + diffClass(closing.mobileSalesDiscrepancy)}>{closing.mobileSalesDiscrepancy}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Other discrepancy</div>
            <div className={'font-mono ' + diffClass(closing.otherSalesDiscrepancy)}>{closing.otherSalesDiscrepancy}</div>
          </div>
        </div>
      </div>

      {/* Handovers */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Handovers</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Total count</div>
            <div>{closing.totalHandovers}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total amount</div>
            <div className="font-mono">{closing.totalHandoverAmount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Pending</div>
            <div className={closing.pendingHandoverCount > 0 ? 'text-amber-700 font-medium' : ''}>
              {closing.pendingHandoverCount} ({closing.pendingHandoverAmount})
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Confirmed</div>
            <div className="text-emerald-700">
              {closing.confirmedHandoverCount} ({closing.confirmedHandoverAmount})
            </div>
          </div>
        </div>
      </div>

      {/* Coverage */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Coverage</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Shifts</div>
            <div>{closing.shiftCount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Reconciliations (SUBMITTED + REVIEWED)</div>
            <div>{closing.reconciliationCount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Pending reviews</div>
            <div className={closing.pendingReviewCount > 0 ? 'text-amber-700 font-medium' : ''}>
              {closing.pendingReviewCount}
            </div>
          </div>
        </div>
        {closing.pendingReviewCount > 0 && (
          <div className="text-xs text-amber-700">
            {closing.pendingReviewCount} reconciliation(s) were still SUBMITTED when this day was closed.
          </div>
        )}
      </div>

      {/* Reopen */}
      {canReopen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-medium text-slate-700">Actions</h2>
          <button
            type="button"
            onClick={() => setShowReopen((v) => !v)}
            className="rounded-lg border border-amber-300 text-amber-800 px-4 py-2 text-sm"
          >
            {showReopen ? 'Hide reopen' : 'Reopen day'}
          </button>
          {showReopen && (
            <div className="space-y-2">
              <TextArea
                label="Reopen reason (min 3 chars)"
                value={reopenReason}
                onChange={setReopenReason}
                rows={2}
              />
              <div className="text-xs text-slate-500">
                Reopening supersedes this version. A subsequent closing creates v{closing.version + 1}.
              </div>
              <button
                type="button"
                onClick={reopen}
                disabled={busy || reopenReason.trim().length < 3}
                className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {busy ? 'Reopening…' : 'Confirm reopen'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Already-reopened info */}
      {closing.status === 'REOPENED' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 space-y-1">
          <div className="font-medium">This closing was reopened.</div>
          {closing.reopenedBy && (
            <div>By {userName(closing.reopenedBy)} at {closing.reopenedAt}</div>
          )}
          {closing.reopenReason && <div>Reason: {closing.reopenReason}</div>}
        </div>
      )}
    </OpsShell>
  );
}