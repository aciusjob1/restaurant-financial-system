// Ops endpoint paths. Mirrors REPORT_PATHS in lib/reports.ts.
//
// STATUS: DRAFT. Some paths are inferred from naming conventions and will
// be verified against backend/src/routes/ in milestone M2 before any
// page actually submits. Any correction lands here only.

export const OPS_PATHS = {
  materials: '/api/v1/materials',
  materialCategories: '/api/v1/material-categories',
  suppliers: '/api/v1/suppliers',
  purchaseInvoices: '/api/v1/purchase-invoices',
  supplierPayments: '/api/v1/supplier-payments',
  stockMovements: '/api/v1/stock-movements',
  salesSummaries: '/api/v1/sales-summaries',
  salesImport: '/api/v1/sales-summaries/import',
  collections: '/api/v1/collections',
  reconciliations: '/api/v1/reconciliations',
  handovers: '/api/v1/handovers',
  expenses: '/api/v1/expenses',
  expenseCategories: '/api/v1/expense-categories',
  salaries: '/api/v1/salaries',
  salaryPayments: '/api/v1/salary-payments',
  shifts: '/api/v1/shifts',
  dailyClosings: '/api/v1/daily-closings',
} as const;