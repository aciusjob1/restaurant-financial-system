/**
 * Minimal, dependency-free CSV parser. Handles:
 *   - RFC-4180 quoting with embedded commas and newlines
 *   - doubled quotes ("") as a literal quote
 *   - LF or CRLF line endings
 *   - optional UTF-8 BOM stripping
 *
 * Returns an array of row arrays. Does NOT validate column counts; the
 * caller decides what shape it expects.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r' && text[i + 1] === '\n') {
      pushRow();
      i += 2;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Final field/row if the input did not end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop trailing fully-empty rows.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}