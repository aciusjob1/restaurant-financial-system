'use client';

import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import type { DailySalesRow, SupplierBalanceRow } from '@/lib/reports';

// Colour palette — small on purpose. Reuses tones from the rest of the
// ops UI so charts read consistently with the stat cards.
const COLORS = ['#0f172a', '#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

function fmtMoney(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Recharts v3 formatter signature accepts ValueType | undefined. Wrap so
// we always render a string and never crash on undefined.
const tooltipFmt = (v: unknown) => fmtMoney(v);

// -----------------------------------------------------------------
// 1. Sales over time
// -----------------------------------------------------------------

export function SalesOverTimeChart({ rows }: { rows: DailySalesRow[] }) {
  const data = rows.map((r) => ({
    date: r.businessDate.slice(5), // MM-DD
    Sales: parseFloat(r.salesTotal) || 0,
    Collected: parseFloat(r.collectionsTotal) || 0,
  }));
  if (data.length === 0) {
    return <EmptyChart label='No sales in this range' />;
  }
  return (
    <ChartCard title='Sales over time'>
      <ResponsiveContainer width='100%' height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
          <CartesianGrid stroke='#e2e8f0' strokeDasharray='3 3' />
          <XAxis dataKey='date' tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: unknown) => fmtMoney(v)} />
          <Tooltip formatter={tooltipFmt} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type='monotone' dataKey='Sales' stroke='#0f172a' strokeWidth={2} dot={false} />
          <Line type='monotone' dataKey='Collected' stroke='#2563eb' strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// -----------------------------------------------------------------
// 2. Collections by method (Cash / Mobile / Other)
// -----------------------------------------------------------------

export function CollectionsByMethodChart({ cash, mobile, other }: { cash: number; mobile: number; other: number }) {
  const data = [
    { name: 'Cash', value: cash },
    { name: 'Mobile', value: mobile },
    { name: 'Other', value: other },
  ].filter((d) => d.value > 0);
  if (data.length === 0) {
    return <EmptyChart label='No collections in this range' />;
  }
  return (
    <ChartCard title='Collections by method'>
      <ResponsiveContainer width='100%' height={240}>
        <PieChart>
          <Pie data={data} dataKey='value' nameKey='name' cx='50%' cy='50%' outerRadius={80}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={tooltipFmt} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// -----------------------------------------------------------------
// 3. Expenses by category
// -----------------------------------------------------------------

export function ExpensesByCategoryChart({ data }: { data: Array<{ categoryId: string; categoryName: string; amount: string }> }) {
  const rows = data
    .map((d) => ({ name: d.categoryName, value: parseFloat(d.amount) || 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) {
    return <EmptyChart label='No expenses in this range' />;
  }
  return (
    <ChartCard title='Expenses by category'>
      <ResponsiveContainer width='100%' height={240}>
        <PieChart>
          <Pie data={rows} dataKey='value' nameKey='name' cx='50%' cy='50%' outerRadius={80}>
            {rows.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={tooltipFmt} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// -----------------------------------------------------------------
// 4. Top suppliers by balance
// -----------------------------------------------------------------

export function TopSuppliersChart({ rows }: { rows: SupplierBalanceRow[] }) {
  const data = rows
    .map((r) => ({ name: r.name, balance: parseFloat(r.balance) || 0 }))
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8);
  if (data.length === 0) {
    return <EmptyChart label='No outstanding supplier balances' />;
  }
  return (
    <ChartCard title='Top suppliers by balance'>
      <ResponsiveContainer width='100%' height={240}>
        <BarChart data={data} layout='vertical' margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke='#e2e8f0' strokeDasharray='3 3' horizontal={false} />
          <XAxis type='number' tick={{ fontSize: 11 }} tickFormatter={(v: unknown) => fmtMoney(v)} />
          <YAxis type='category' dataKey='name' tick={{ fontSize: 11 }} width={120} />
          <Tooltip formatter={tooltipFmt} />
          <Bar dataKey='balance' fill='#0f172a' />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// -----------------------------------------------------------------
// Shared wrappers
// -----------------------------------------------------------------

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4'>
      <h2 className='text-sm font-medium text-slate-700 mb-2'>{title}</h2>
      {children}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <ChartCard title={label}>
      <div className='h-[240px] flex items-center justify-center text-sm text-slate-400'>
        —
      </div>
    </ChartCard>
  );
}
