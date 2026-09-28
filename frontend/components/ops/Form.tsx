'use client';

import type { ReactNode } from 'react';

type FieldBase = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{text}</span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none disabled:bg-slate-50 disabled:text-slate-500';

export function TextField(p: FieldBase & { autoComplete?: string; type?: 'text' | 'password' | 'email' | 'tel' }) {
  return (
    <Label text={p.label}>
      <input
        type={p.type ?? 'text'}
        className={INPUT_CLS}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        placeholder={p.placeholder}
        autoComplete={p.autoComplete}
        disabled={p.disabled}
      />
    </Label>
  );
}

export function DecimalField(p: FieldBase) {
  return (
    <Label text={p.label}>
      <input
        type="text"
        inputMode="decimal"
        className={INPUT_CLS + ' font-mono'}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        placeholder={p.placeholder}
        disabled={p.disabled}
      />
    </Label>
  );
}

export function DateField(p: FieldBase) {
  return (
    <Label text={p.label}>
      <input
        type="date"
        className={INPUT_CLS}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        disabled={p.disabled}
      />
    </Label>
  );
}

export function SelectField(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Label text={p.label}>
      <select
        className={INPUT_CLS + ' bg-white'}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        disabled={p.disabled}
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Label>
  );
}

export function TextArea(p: FieldBase & { rows?: number }) {
  return (
    <Label text={p.label}>
      <textarea
        className={INPUT_CLS}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        placeholder={p.placeholder}
        rows={p.rows ?? 3}
        disabled={p.disabled}
      />
    </Label>
  );
}

export function FormError({ code, message }: { code: string; message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <div className="font-mono font-medium">{code}</div>
      <div className="mt-1">{message}</div>
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {busy ? 'Working...' : children}
    </button>
  );
}