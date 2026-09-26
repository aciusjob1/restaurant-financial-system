// Report endpoints and shared response types.
//
// IMPORTANT: all financial values returned by the backend are DECIMAL STRINGS
// (e.g. "25000.00"). The frontend MUST NOT parse, sum, round, or compare them
// numerically. Display the strings as-received. The backend is the single
// source of truth for every total.

export type DailySalesRow = {
  businessDate: string;
  salesTotal: string;
  cashSales: string;
  mobileSales: string;
  otherSales: string;
  collectionsTotal: string;
  expectedCash: string;
  expectedMobile: string;
  actualCash: string;
  actualMobile: string;
  cashDifference: string;
  mobileDifference: string;
  handoverTotal: string;
  expenseTotal: string;
  closingStatus: string | null;
};

export type DailySalesResponse = {
  success: true;
  rows: DailySalesRow[];
  totals: {
    salesTotal: string;
    expenseTotal: string;
    cashDifference: string;
    mobileDifference: string;
    handoverTotal: string;
    rowCount: number;
  };
};

export type ExpenseRow = {
  id: string;
  expenseNumber: string;
  businessDate: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  paymentMethod: string;
  description: string;
  status: string;
  createdByUsername: string;
  approvedByUsername: string | null;
  approvedAt: string | null;
};

export type ExpenseResponse = {
  success: true;
  rows: ExpenseRow[];
  totals: {
    amount: string;
    cashAmount: string;
    nonCashAmount: string;
    rowCount: number;
    byCategory: Array<{ categoryId: string; categoryName: string; amount: string }>;
  };
};

export type StockMovementRow = {
  id: string;
  movementNumber: string;
  materialId: string;
  materialName: string | null;
  type: string;
  direction: string;
  businessDate: string;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  purchaseItemId: string | null;
  reversalOfId: string | null;
  reference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
};

export type StockMovementsResponse = {
  success: true;
  rows: StockMovementRow[];
  totals: {
    totalIn: string;
    totalOut: string;
    netChange: string;
    movementCount: number;
    byType: Array<{ type: string; count: number; totalIn: string; totalOut: string }>;
  };
};

export type ReconciliationRow = {
  id: string;
  businessDate: string;
  userId: string;
  username: string;
  fullName: string;
  shiftId: string;
  expectedCash: string;
  expectedMobile: string;
  actualCash: string | null;
  actualMobile: string | null;
  cashDifference: string | null;
  mobileDifference: string | null;
  status: string;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type ReconciliationsResponse = {
  success: true;
  rows: ReconciliationRow[];
  totals: { cashDifference: string; mobileDifference: string; count: number };
};

export type HandoverRow = {
  id: string;
  businessDate: string;
  reconciliationId: string;
  fromUserId: string;
  fromUsername: string;
  fromFullName: string;
  toUserId: string;
  toUsername: string;
  toFullName: string;
  amount: string;
  status: string;
  handedOverAt: string;
  confirmedAt: string | null;
};

export type HandoversResponse = {
  success: true;
  rows: HandoverRow[];
  totals: {
    amount: string;
    pendingCount: number;
    pendingAmount: string;
    confirmedCount: number;
    confirmedAmount: string;
    rowCount: number;
  };
};

export type SupplierBalanceRow = {
  supplierId: string;
  supplierNumber: string;
  name: string;
  totalInvoiced: string;
  totalPaid: string;
  totalAllocated: string;
  totalUnallocated: string;
  balance: string;
  isActive: boolean;
};

export type SupplierBalancesResponse = {
  success: true;
  rows: SupplierBalanceRow[];
  totals: { balance: string; invoiced: string; paid: string };
};

export type SalesVsPosRow = {
  businessDate: string;
  posTotal: string;
  posCash: string;
  posMobile: string;
  posOther: string;
  collectionsTotal: string;
  collectionsCash: string;
  collectionsMobile: string;
  collectionsOther: string;
  cashVariance: string;
  mobileVariance: string;
  otherVariance: string;
  isReconciled: boolean;
};

export type SalesVsPosResponse = {
  success: true;
  rows: SalesVsPosRow[];
  totals: {
    cashVariance: string;
    mobileVariance: string;
    otherVariance: string;
    rowCount: number;
  };
};

export const REPORT_PATHS = {
  dailySales: '/api/v1/reports/daily-sales',
  reconciliations: '/api/v1/reports/reconciliations',
  handovers: '/api/v1/reports/handovers',
  expenses: '/api/v1/reports/expenses',
  supplierBalances: '/api/v1/reports/supplier-balances',
  salesVsPos: '/api/v1/reports/sales-vs-pos',
  stockMovements: '/api/v1/reports/stock-movements',
} as const;

/**
 * Default date range for report pages: the last 30 days inclusive, as
 * YYYY-MM-DD strings. Used by both the FilterBar (initial display) and each
 * report page (initial API query). Not a financial calculation.
 */
export function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}