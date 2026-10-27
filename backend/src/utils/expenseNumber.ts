import type { Prisma } from '@prisma/client';
import { nextDocumentNumber } from './documentNumber.js';

// Shared helper — generates the next EXP-#### sequence value.
// Extracted from expenseService so salaryService can create the linked
// Salary Expense row without a circular import.
export async function nextExpenseNumber(tx: Prisma.TransactionClient): Promise<string> {
  return nextDocumentNumber(tx, 'expense');
}
