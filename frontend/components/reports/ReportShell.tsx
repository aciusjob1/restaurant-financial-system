import Link from 'next/link';
import type { ReactNode } from 'react';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/reports/daily-sales', label: 'Daily Sales' },
  { href: '/reports/reconciliations', label: 'Reconciliations' },
  { href: '/reports/handovers', label: 'Handovers' },
  { href: '/reports/expenses', label: 'Expenses' },
  { href: '/reports/supplier-balances', label: 'Suppliers' },
  { href: '/reports/sales-vs-pos', label: 'Sales vs POS' },
  { href: '/reports/stock-movements', label: 'Stock Movements' },
];

export function ReportShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
            ← Dashboard
          </Link>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">{children}</main>
    </div>
  );
}