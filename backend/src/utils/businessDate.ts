/**
 * Returns today's calendar date in the server's configured timezone as a
 * plain Date at UTC midnight. The date is intended to be stored in a
 * PostgreSQL `date` column, so no time zone information is preserved.
 */
export function todayBusinessDate(): Date {
  const now = new Date();
  // Use Intl to get the calendar date in the server's local timezone.
  // toLocaleDateString('en-CA') yields YYYY-MM-DD.
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Parse a YYYY-MM-DD string into a Date at UTC midnight. Does not accept
 * anything else. The stored value round-trips as YYYY-MM-DD via toDateOnly.
 */
export function parseBusinessDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid businessDate: ${s}`);
  }
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid businessDate: ${s}`);
  return d;
}

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}