'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/LanguageContext';

export type Column<Row> = {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: Row) => ReactNode;
  cellClassName?: string;
};

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyMessage,
}: {
  columns: Array<Column<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyMessage?: string;
}) {
  const { t } = useT();
  const message = emptyMessage ?? t('reports.table.noRows');
  if (rows.length === 0) {
    return (
      <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500'>
        {message}
      </div>
    );
  }

  return (
    <div className='overflow-x-auto rounded-2xl border border-slate-200 bg-white'>
      <table className='w-full text-sm'>
        <thead className='bg-slate-50 text-slate-600'>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={
                  'px-3 py-2 font-medium whitespace-nowrap ' +
                  (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')
                }
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y divide-slate-100'>
          {rows.map((row) => (
            <tr key={rowKey(row)} className='hover:bg-slate-50'>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={
                    'px-3 py-2 whitespace-nowrap ' +
                    (c.align === 'right' ? 'text-right ' : c.align === 'center' ? 'text-center ' : '') +
                    (c.cellClassName ?? 'text-slate-700')
                  }
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
