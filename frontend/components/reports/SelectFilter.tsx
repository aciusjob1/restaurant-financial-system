'use client';

import { useReportFilters } from '@/hooks/useReportFilters';

export function SelectFilter({
  paramName,
  label,
  options,
  defaultValue = '',
}: {
  paramName: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}) {
  const { getParam, setParam } = useReportFilters();
  const value = getParam(paramName) ?? defaultValue;

  return (
    <label className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => setParam(paramName, e.target.value || null)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}