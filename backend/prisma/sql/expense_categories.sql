-- Ensures system-defined expense categories exist. Idempotent: safe to re-run.
--
-- salaryService.createLinkedSalaryExpense looks up the category keyed by
-- systemKey = 'SALARY' when recording a salary payment. Without this row,
-- payment creation fails with 409 NO_SALARY_CATEGORY.
--
-- This belongs here rather than in seed.ts: it is a schema-level fixture
-- (the app cannot function without it), not sample data.

INSERT INTO "ExpenseCategory" (id, name, "systemKey", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Salaries', 'SALARY', true, NOW(), NOW())
ON CONFLICT ("systemKey") DO UPDATE
  SET "isActive" = true, "updatedAt" = NOW();
