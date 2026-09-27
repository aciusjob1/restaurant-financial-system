import Link from 'next/link';
import { OpsShell, OpsHeader } from '@/components/ops/OpsShell';

const DOMAINS: Array<{ href: string; title: string; description: string }> = [
  { href: '/ops/materials',            title: 'Materials',            description: 'Create, update, and deactivate materials.' },
  { href: '/ops/material-categories',  title: 'Material Categories',  description: 'Manage material categories.' },
  { href: '/ops/expense-categories',   title: 'Expense Categories',   description: 'Group expenses for reporting.' },
  { href: '/ops/suppliers',            title: 'Suppliers',            description: 'Create, update, and deactivate suppliers.' },
  { href: '/ops/employees',            title: 'Employees',            description: 'Manage employee records.' },
  { href: '/ops/positions',            title: 'Positions',            description: 'Manage positions and pay grades.' },
  { href: '/ops/purchase-invoices',    title: 'Purchase Invoices',    description: 'Record supplier invoices and post them.' },
  { href: '/ops/supplier-payments',    title: 'Supplier Payments',    description: 'Record payments and allocate them to invoices.' },
  { href: '/ops/stock-movements',      title: 'Stock Movements',      description: 'Manual opening, consumption, waste, and adjustments.' },
  { href: '/ops/sales',                title: 'Sales',                description: 'Manual sales summary and POS CSV import.' },
  { href: '/ops/shifts',               title: 'Shifts',               description: 'Start shifts and review their lifecycle.' },
  { href: '/ops/reconciliations',      title: 'Reconciliations',      description: 'Review, send back, and approve reconciliations.' },
  { href: '/ops/collections',          title: 'Collections',          description: 'Record customer payments against an open shift.' },
  { href: '/ops/handovers',            title: 'Handovers',            description: 'Confirm cash handovers from waiters.' },
  { href: '/ops/expenses',             title: 'Expenses',             description: 'Create, submit, approve, and reject expenses.' },
  { href: '/ops/salaries',             title: 'Salaries',             description: 'Create, approve, pay, and void salary payments.' },
  { href: '/ops/daily-closing',        title: 'Daily Closing',        description: 'Close the business day; reopen as OWNER if needed.' },
];

export default function OpsHubPage() {
  return (
    <OpsShell>
      <OpsHeader
        title="Operations"
        subtitle="Manager and owner recording workflows. Server-side validation; the UI only displays returned values."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DOMAINS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm"
          >
            <h2 className="text-base font-medium text-slate-900">{d.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{d.description}</p>
          </Link>
        ))}
      </div>
    </OpsShell>
  );
}
