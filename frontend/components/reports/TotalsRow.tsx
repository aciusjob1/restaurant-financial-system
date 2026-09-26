import type { ReactNode } from 'react';

export type TotalItem = {
  label: string;
  /** Pre-formatted string from the backend. Render as-is. */
  value: ReactNode;
  emphasis?: boolean;
};

export function TotalsRow({ items }: { items: TotalItem[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{item.label}</dt>
            <dd
              className={
                'mt-1 font-mono ' +
                (item.emphasis ? 'text-slate-900 font-semibold' : 'text-slate-800')
              }
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}