'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';
import { DecimalField, TextArea, FormError } from '@/components/ops/Form';
import { apiFetch, ApiError } from '@/lib/api';

type Reconciliation = {
  id: string;
  shiftId: string;
  userId: string;
  expectedCash: string;
  expectedMobile: string;
  actualCash: string | null;
  actualMobile: string | null;
  cashDifference: string | null;
  mobileDifference: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  notes: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Shift = { id: string; userId: string; businessDate: string; status: string };
type User = { id: string; fullName: string; username: string; role: string };

function errOf(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'ERR', message: 'Request failed' };
}

export default function ReconciliationDetailPage() {
  const params = useParams<{ id: string }>();
  const reconId = params.id;

  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [actualCash, setActualCash] = useState('');
  const [actualMobile, setActualMobile] = useState('');
  const [notes, setNotes] = useState('');

  const [reviewNotes, setReviewNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);

  function load() {
    setLoading(true);
    setErr(null);
    apiFetch<{ success: true; reconciliation: Reconciliation }>(
      `/api/v1/reconciliations/${reconId}`
    )
      .then((r) => {
        setRec(r.reconciliation);
        setActualCash(r.reconciliation.actualCash ?? '');
        setActualMobile(r.reconciliation.actualMobile ?? '');
        setNotes(r.reconciliation.notes ?? '');
        return apiFetch<{ success: true; shift: Shift }>(
          `/api/v1/shifts/${r.reconciliation.shiftId}`
        );
      })
      .then((sr) => setShift(sr.shift))
      .catch((e) => setErr(errOf(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [reconId]);

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

  async function saveActuals(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/reconciliations/${reconId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          actualCash,
          actualMobile,
          notes: notes.trim() === '' ? null : notes.trim(),
        }),
      });
      load();
    } catch (e) {
      setErr(errOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReconciliation() {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/reconciliations/${reconId}/submit`, {
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

  async function review(decision: 'APPROVE' | 'SEND_BACK') {
    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/reconciliations/${reconId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reviewNotes: reviewNotes.trim() === '' ? undefined : reviewNotes.trim(),
        }),
      });
      setReviewNotes('');
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
        <OpsHeader title="Reconciliation" />
        <div className="text-slate-500">Loading…</div>
      </OpsShell>
    );
  }

  if (!rec) {
    return (
      <OpsShell>
        <OpsHeader title="Reconciliation" />
        {err && <FormError code={err.code} message={err.message} />}
        <Link href="/ops/reconciliations" className="text-sm text-slate-700 underline">← Back to list</Link>
      </OpsShell>
    );
  }

  const isDraft = rec.status === 'DRAFT';
  const isSubmitted = rec.status === 'SUBMITTED';
  const isReviewed = rec.status === 'REVIEWED';
  const isManager = myRole === 'MANAGER' || myRole === 'OWNER';

  function diffClass(v: string | null): string {
    if (v === null) return 'text-slate-400';
    const n = parseFloat(v);
    if (n === 0) return 'text-slate-500';
    return n > 0 ? 'text-emerald-700' : 'text-red-700';
  }

  return (
    <OpsShell>
      <OpsHeader
        title={`Reconciliation ${rec.id.slice(0, 8)}…`}
        subtitle={`${userName(rec.userId)}${shift ? ' — ' + shift.businessDate : ''} — ${rec.status}`}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/ops/reconciliations" className="text-slate-500 hover:text-slate-900">← All reconciliations</Link>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{rec.status}</span>
      </div>

      {err && <FormError code={err.code} message={err.message} />}

      {/* Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Expected cash</div>
            <div className="font-mono">{rec.expectedCash}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Actual cash</div>
            <div className="font-mono">{rec.actualCash ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Cash difference</div>
            <div className={'font-mono ' + diffClass(rec.cashDifference)}>{rec.cashDifference ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Expected mobile</div>
            <div className="font-mono">{rec.expectedMobile}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Actual mobile</div>
            <div className="font-mono">{rec.actualMobile ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Mobile difference</div>
            <div className={'font-mono ' + diffClass(rec.mobileDifference)}>{rec.mobileDifference ?? '—'}</div>
          </div>
        </div>
        {rec.notes && (
          <div className="text-sm text-slate-600">
            <span className="text-slate-500">Notes: </span>{rec.notes}
          </div>
        )}
        {rec.submittedAt && (
          <div className="text-xs text-slate-500">Submitted at {rec.submittedAt}</div>
        )}
        {rec.reviewedAt && (
          <div className="text-xs text-slate-500">
            Reviewed by {userName(rec.reviewedBy || '')} at {rec.reviewedAt}
            {rec.reviewNotes && <> — {rec.reviewNotes}</>}
          </div>
        )}
      </div>

      {/* Waiter edit form — DRAFT + WAITER role (or the owner of the recon if role unknown) */}
      {isDraft && !isManager && (
        <form onSubmit={saveActuals} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-700">Enter actuals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DecimalField label="Actual cash" value={actualCash} onChange={setActualCash} required placeholder="0.00" />
            <DecimalField label="Actual mobile" value={actualMobile} onChange={setActualMobile} required placeholder="0.00" />
          </div>
          <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save actuals'}
            </button>
            <button
              type="button"
              onClick={submitReconciliation}
              disabled={busy || actualCash.trim() === '' || actualMobile.trim() === ''}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Submit for review
            </button>
          </div>
          <div className="text-xs text-slate-500">
            Both actualCash and actualMobile are required before submitting.
          </div>
        </form>
      )}

      {/* Manager review form — SUBMITTED + MANAGER/OWNER */}
      {isSubmitted && isManager && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-700">Review</h2>
          <TextArea
            label="Review notes (optional)"
            value={reviewNotes}
            onChange={setReviewNotes}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => review('APPROVE')}
              disabled={busy}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? 'Working…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => review('SEND_BACK')}
              disabled={busy}
              className="rounded-lg border border-amber-300 text-amber-800 px-4 py-2 text-sm disabled:opacity-60"
            >
              Send back to draft
            </button>
          </div>
        </div>
      )}

      {/* Status notes */}
      {isSubmitted && !isManager && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Submitted and awaiting manager review.
        </div>
      )}
      {isDraft && isManager && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Draft owned by {userName(rec.userId)}. Wait for the waiter to submit before reviewing.
        </div>
      )}
      {isReviewed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Reviewed and approved. This reconciliation is now read-only.
        </div>
      )}
    </OpsShell>
  );
}