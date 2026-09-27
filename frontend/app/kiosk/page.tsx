'use client';

import { KioskShell, KioskHeader } from '@/components/kiosk/KioskShell';

// 18.1 ships the shell + routing. 18.2 fills in the stateful workflow:
//   no shift -> start shift
//   OPEN -> add collections + submit
//   SUBMITTED (no recon) -> create reconciliation
//   recon DRAFT -> enter actuals + submit
//   recon SUBMITTED/REVIEWED (no handover) -> create handover
//   handover PENDING -> wait for manager
//   handover CONFIRMED + shift not CLOSED -> wait for manager to close
//   shift CLOSED -> done
//
// Architectural constraint: the kiosk never calculates authoritative
// financial state. Every decision (can this shift be submitted? is a
// handover allowed?) comes from the backend.
export default function KioskPage() {
  return (
    <KioskShell>
      <KioskHeader
        title="Kiosk"
        subtitle="Waiter operational interface."
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Kiosk workflow coming in 18.2 — shift start, collections, submit,
        reconciliation, handover.
      </div>
    </KioskShell>
  );
}