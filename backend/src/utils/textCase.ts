/**
 * Canonical casing for person-name fields.
 *
 * Rules, in order:
 *   1. Trim leading/trailing whitespace.
 *   2. Collapse runs of whitespace to a single space.
 *   3. Lowercase the whole string.
 *   4. Uppercase the first letter of the string and any letter that
 *      follows a space, apostrophe, or hyphen.
 *
 * No special handling for particles (van, der, de) or prefixes
 * (Mc, Mac). The output is predictable: any letter that begins a
 * word-separated segment is capitalized.
 */
export function titleCaseName(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, ' ').toLowerCase();
  return collapsed.replace(/(^|[\s'\-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}