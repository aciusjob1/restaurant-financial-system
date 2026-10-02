import type { Prisma } from '@prisma/client';

// Shared helper — generates the next EXP-#### sequence value.
// Extracted from expenseService so salaryService can create the linked
// Salary Expense row without a circular import.
export async function nextExpenseNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
    "SELECT nextval('expense_number_seq') AS nextval"
  );
  const n = rows[0]?.nextval ?? 1n;
  return 'EXP-' + n.toString().padStart(4, '0');
}
