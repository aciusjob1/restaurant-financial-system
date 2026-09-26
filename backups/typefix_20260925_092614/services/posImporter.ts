import { parseCsv } from '../utils/csv.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal } from '../utils/money.js';
import type { Prisma } from '@prisma/client';

export type PaymentMethod =
  | 'CASH'
  | 'MPESA'
  | 'AIRTEL_MONEY'
  | 'TIGO_PESA'
  | 'HALOPESA'
  | 'BANK'
  | 'CARD'
  | 'OTHER';

export interface ParsedSummary {
  businessDate: string;
  sourceReference: string;
  notes: string | null;
  lines: Array<{
    paymentMethod: PaymentMethod;
    amount: Prisma.Decimal;
    notes: string | null;
  }>;
}

const PAYMENT_METHODS: ReadonlySet<string> = new Set([
  'CASH',
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
  'BANK',
  'CARD',
  'OTHER',
]);

/**
 * Sniffs the header row and dispatches to the right parser.
 *
 * Detailed format header (any order, case-insensitive):
 *   businessDate, sourceReference, paymentMethod, amount, notes?
 *
 * Aggregate format header (any order, case-insensitive):
 *   businessDate, sourceReference, cashSales, mobileSales, otherSales, notes?
 *
 * `source` is not present in the CSV; the caller (importer service)
 * always writes `EXISTING_POS` for CSV imports. `MANUAL` is used only for
 * the JSON manual-entry endpoint.
 */
export function parseSalesCsv(raw: string): ParsedSummary[] {
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    throw new ApiError(400, 'EMPTY_CSV', 'CSV contains no data rows.');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name);

  const businessDateIdx = idx('businessdate');
  const sourceRefIdx = idx('sourcereference');
  const notesIdx = idx('notes');

  if (businessDateIdx === -1 || sourceRefIdx === -1) {
    throw new ApiError(
      400,
      'BAD_HEADER',
      'CSV must contain businessDate and sourceReference columns.'
    );
  }

  const detailedMethodIdx = idx('paymentmethod');
  const detailedAmountIdx = idx('amount');

  const aggregateCashIdx = idx('cashsales');
  const aggregateMobileIdx = idx('mobilesales');
  const aggregateOtherIdx = idx('othersales');

  const isDetailed = detailedMethodIdx !== -1 && detailedAmountIdx !== -1;
  const isAggregate =
    aggregateCashIdx !== -1 && aggregateMobileIdx !== -1 && aggregateOtherIdx !== -1;

  if (!isDetailed && !isAggregate) {
    throw new ApiError(
      400,
      'BAD_HEADER',
      'CSV must be either detailed (paymentMethod, amount) or aggregate ' +
        '(cashSales, mobileSales, otherSales).'
    );
  }

  // Group rows by (businessDate, sourceReference). Both formats can carry
  // multiple summaries in one file if the POS exports more than one day
  // or terminal.
  const groups = new Map<string, ParsedSummary>();

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r].map((c) => c.trim());
    const businessDate = cells[businessDateIdx] ?? '';
    const sourceReference = cells[sourceRefIdx] ?? '';
    const notes = notesIdx !== -1 ? (cells[notesIdx] || null) : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new ApiError(
        400,
        'BAD_ROW',
        `Row ${r + 1}: businessDate must be YYYY-MM-DD (got "${businessDate}").`
      );
    }

    const key = `${businessDate}::${sourceReference}`;
    let group = groups.get(key);
    if (!group) {
      group = { businessDate, sourceReference, notes, lines: [] };
      groups.set(key, group);
    }

    if (isDetailed) {
      const method = cells[detailedMethodIdx]?.toUpperCase() ?? '';
      const amountStr = cells[detailedAmountIdx] ?? '';
      if (!PAYMENT_METHODS.has(method)) {
        throw new ApiError(
          400,
          'BAD_ROW',
          `Row ${r + 1}: unknown paymentMethod "${method}".`
        );
      }
      const amount = parseMoney(amountStr, r + 1);
      group.lines.push({
        paymentMethod: method as PaymentMethod,
        amount,
        notes: null,
      });
    } else {
      const cash = parseMoney(cells[aggregateCashIdx] ?? '', r + 1);
      const mobile = parseMoney(cells[aggregateMobileIdx] ?? '', r + 1);
      const other = parseMoney(cells[aggregateOtherIdx] ?? '', r + 1);
      // Normalize aggregate into a small set of canonical lines. The
      // reconciliation in Phase 7 will look at cash vs mobile vs other, not
      // at which specific mobile provider it was.
      if (!cash.isZero()) {
        group.lines.push({ paymentMethod: 'CASH', amount: cash, notes: null });
      }
      if (!mobile.isZero()) {
        // Aggregate "mobile" cannot be split; store it as MPESA by
        // convention. Phase 7 reconciles on the mobile aggregate.
        group.lines.push({ paymentMethod: 'MPESA', amount: mobile, notes: null });
      }
      if (!other.isZero()) {
        group.lines.push({ paymentMethod: 'OTHER', amount: other, notes: null });
      }
    }
  }

  // A summary with zero lines is useless and probably a data error.
  for (const g of groups.values()) {
    if (g.lines.length === 0) {
      throw new ApiError(
        400,
        'EMPTY_SUMMARY',
        `Summary ${g.businessDate}/${g.sourceReference} has no lines.`
      );
    }
  }

  return Array.from(groups.values());
}

function parseMoney(s: string, row: number): Prisma.Decimal {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
    throw new ApiError(
      400,
      'BAD_ROW',
      `Row ${row}: amount must be a decimal with up to 2 places (got "${s}").`
    );
  }
  return toDecimal(s);
}