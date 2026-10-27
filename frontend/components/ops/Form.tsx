'use client';

import { useId, useState, type ReactNode } from 'react';
import { titleCaseName } from '@/lib/textCase';

type FieldBase = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
};

function Label({ text, hint, hintId, children }: { text: string; hint?: string; hintId?: string; children: ReactNode }) {
  return (
    <div className="block">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{text}</span>
        {children}
      </label>
      {hint && (
        <div id={hintId} className="mt-1 text-xs leading-snug text-slate-500">{hint}</div>
      )}
    </div>
  );
}

const INPUT_CLS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none disabled:bg-slate-50 disabled:text-slate-500';

export function TextField(p: FieldBase & {
  autoComplete?: string;
  type?: 'text' | 'password' | 'email' | 'tel';
  titleCase?: boolean;
  normalizeBlur?: (v: string) => string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const hintId = useId();
  const isPassword = p.type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : (p.type ?? 'text');

  return (
    <Label text={p.label} hint={p.hint} hintId={hintId}>
      <div className="relative">
        <input
          type={inputType}
          className={INPUT_CLS + (isPassword ? ' pr-10' : '')}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          onBlur={p.titleCase || p.normalizeBlur
            ? (e) => {
                let next = e.target.value;
                if (p.normalizeBlur) next = p.normalizeBlur(next);
                if (p.titleCase) next = titleCaseName(next);
                if (next !== p.value) p.onChange(next);
              }
            : undefined}
          required={p.required}
          placeholder={p.placeholder}
          autoComplete={p.autoComplete}
          disabled={p.disabled}
          aria-describedby={p.hint ? hintId : undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            )}
          </button>
        )}
      </div>
    </Label>
  );
}

export function DecimalField(p: FieldBase) {
  const hintId = useId();
  return (
    <Label text={p.label} hint={p.hint} hintId={hintId}>
      <input
        type="text"
        inputMode="decimal"
        className={INPUT_CLS + ' font-mono'}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        placeholder={p.placeholder}
        disabled={p.disabled}
        aria-describedby={p.hint ? hintId : undefined}
      />
    </Label>
  );
}

export function DateField(p: FieldBase) {
  const hintId = useId();
  return (
    <Label text={p.label} hint={p.hint} hintId={hintId}>
      <input
        type="date"
        className={INPUT_CLS}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        disabled={p.disabled}
        aria-describedby={p.hint ? hintId : undefined}
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
  hint?: string;
}) {
  const hintId = useId();
  return (
    <Label text={p.label} hint={p.hint} hintId={hintId}>
      <select
        className={INPUT_CLS + ' bg-white'}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        disabled={p.disabled}
        aria-describedby={p.hint ? hintId : undefined}
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Label>
  );
}

export function TextArea(p: FieldBase & { rows?: number }) {
  const hintId = useId();
  return (
    <Label text={p.label} hint={p.hint} hintId={hintId}>
      <textarea
        className={INPUT_CLS}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        required={p.required}
        placeholder={p.placeholder}
        rows={p.rows ?? 3}
        disabled={p.disabled}
        aria-describedby={p.hint ? hintId : undefined}
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