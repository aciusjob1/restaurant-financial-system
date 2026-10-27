import pkg from '@prisma/client';
import type { Prisma } from '@prisma/client';

const { Decimal } = pkg.Prisma;

/**
 * Convert a validated decimal string (e.g. "350000.00") to a Prisma.Decimal.
 * Throws if the input is not a finite decimal.
 */
export function toDecimal(input: string | number | Prisma.Decimal): Prisma.Decimal {
  if (input instanceof Decimal) return input;
  return new Decimal(input);
}

/**
 * Serialize a Prisma.Decimal (or anything Decimal-compatible) to a fixed
 * 2-decimal string. This is what crosses the API boundary.
 */
export function toMoneyString(input: Prisma.Decimal | string | number): string {
  const d = input instanceof Decimal ? input : new Decimal(input);
  return d.toFixed(2);
}