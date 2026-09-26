import Link from 'next/link';
import { ReportShell } from '@/components/reports/ReportShell';
import { ReportHeader } from '@/components/reports/StateViews';

const REPORTS: Array<{ href: string; title: string; description: string }> = [
  {
    href: '/reports/daily-sales',
    title: 'Daily Sales & Cash Position',
    description:
      'Per-business-date sales, collections, reconciliation, handovers, and expenses.',
  },
  {
    href: '/reports/reconciliations',
    title: 'Reconciliation Summary',
    description:
      'Per-shift expected vs actual cash and mobile, with differences and review status.',
  },
  {
    href: '/reports/handovers',
    title: 'Cash Handover Ledger',
    description:
      'Chronological handovers between staff, with confirmation state.',
  },
  {
    href: '/reports/expenses',
    title: 'Expenses',
    description:
      'Expenses across the selected range, grouped by category and payment method.',
  },
  {
    href: '/reports/supplier-balances',
    title: 'Supplier Balances',
    description:
      'Outstanding balance per supplier, based on posted invoices and active allocations.',
  },
  {
    href: '/reports/sales-vs-pos',
    title: 'Sales vs POS',
    description:
      'Declared POS sales compared to recorded collections, per business date.',
  },
  {
    href: '/reports/stock-movements',
    title: 'Stock Movements',
    description:
      'Append-only ledger of every stock movement across the selected range.',
  },
];

export default function ReportsLandingPage() {
  return (
    <ReportShell>
      <ReportHeader
        title="Reports"
        subtitle="Operational and financial reports. All calculations are performed server-side; the UI only displays returned values."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
          >
            <h2 className="text-base font-medium text-slate-900">{r.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{r.description}</p>
          </Link>
        ))}
      </div>
    </ReportShell>
  );
}