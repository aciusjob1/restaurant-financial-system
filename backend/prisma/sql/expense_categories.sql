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

-- Daily report expense category. Used by the waiter kiosk's single-screen
-- daily report (Total Sales, M-Pesa rows, Expenses rows). Every expense the
-- waiter records there is attached to this category; managers can re-categorise
-- later from the ops Expenses screen if needed.
--
-- Same idempotency contract as SALARY above: re-running this file cannot
-- create a duplicate row.
INSERT INTO "ExpenseCategory" (id, name, "systemKey", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Daily Expenses', 'DAILY', true, NOW(), NOW())
ON CONFLICT ("systemKey") DO UPDATE
  SET "isActive" = true, "updatedAt" = NOW();
