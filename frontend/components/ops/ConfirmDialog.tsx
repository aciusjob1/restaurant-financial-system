'use client';

import type { ReactNode } from 'react';

/**
 * Modal confirmation for irreversible actions (post, cancel, approve,
 * void, reopen). Callers control visibility. Renders nothing when closed.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4">
        <h3 className="text-lg font-medium text-slate-900">{title}</h3>
        <div className="text-sm text-slate-600">{body}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              'rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ' +
              (danger ? 'bg-red-600' : 'bg-slate-900')
            }
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}