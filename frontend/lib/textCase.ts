/**
 * Canonical casing for person-name fields. Mirrors
 * backend/src/utils/textCase.ts. Keep both in sync if either changes.
 */
export function titleCaseName(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, ' ').toLowerCase();
  return collapsed.replace(/(^|[\s'\-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}