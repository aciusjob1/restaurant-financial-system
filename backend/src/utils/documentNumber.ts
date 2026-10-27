import { Prisma } from '@prisma/client';

const DOCUMENTS = {
  expense: {
    table: '"Expense"',
    column: '"expenseNumber"',
    prefix: 'EXP',
    sequence: 'expense_number_seq',
  },
  salary: {
    table: '"SalaryRecord"',
    column: '"salaryNumber"',
    prefix: 'SAL',
    sequence: 'salary_number_seq',
  },
  employee: {
    table: '"Employee"',
    column: '"employeeNumber"',
    prefix: 'EMP',
    sequence: 'employee_number_seq',
  },
  material: {
    table: '"Material"',
    column: '"materialNumber"',
    prefix: 'MAT',
    sequence: 'material_number_seq',
  },
  supplier: {
    table: '"Supplier"',
    column: '"supplierNumber"',
    prefix: 'SUP',
    sequence: 'supplier_number_seq',
  },
  payment: {
    table: '"SupplierPayment"',
    column: '"paymentNumber"',
    prefix: 'PAY',
    sequence: 'payment_number_seq',
  },
} as const;

export type DocumentKind = keyof typeof DOCUMENTS;

// nextval() is snapshot-independent, unlike MAX() inside a REPEATABLE READ
// or SERIALIZABLE transaction (its snapshot can predate rows committed while
// an advisory-lock holder waited), and it needs no lock. Gaps are possible
// when a transaction rolls back after allocating, which is fine for IDs.
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  kind: DocumentKind
): Promise<string> {
  const doc = DOCUMENTS[kind];
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>(
    Prisma.sql`SELECT nextval(${doc.sequence}::regclass) AS value`
  );
  const value = Number(rows[0]?.value ?? 1n);
  return `${doc.prefix}-${String(value).padStart(4, '0')}`;
}

// Sequences live outside snapshots and transactions, so seed them once from
// the highest number already present (legacy MAX+1 rows, restored backups).
// Call at startup, never while other writers are allocating.
export async function syncDocumentSequences(client: Prisma.TransactionClient): Promise<void> {
  for (const doc of Object.values(DOCUMENTS)) {
    const rows = await client.$queryRaw<Array<{ max: number | null }>>(
      Prisma.sql`
        SELECT MAX(regexp_replace(${Prisma.raw(doc.column)}, '^[A-Z]+-', '')::int) AS max
        FROM ${Prisma.raw(doc.table)}
        WHERE ${Prisma.raw(doc.column)} ~ ${'^' + doc.prefix + '-[0-9]+$'}
      `
    );
    const max = rows[0]?.max ?? 0;
    if (max <= 0) continue;
    await client.$queryRaw(
      Prisma.sql`
        SELECT setval(
          ${doc.sequence}::regclass,
          GREATEST(
            (SELECT COALESCE(last_value, 1) FROM pg_sequences
              WHERE schemaname = 'public' AND sequencename = ${doc.sequence}),
            ${max}
          ),
          true
        )
      `
    );
  }
}
