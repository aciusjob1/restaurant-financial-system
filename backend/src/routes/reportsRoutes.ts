import { Router } from 'express';
import * as reports from '../controllers/reportsController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import {
  DailySalesQuery,
  ReconciliationQuery,
  HandoversQuery,
  ExpensesQuery,
  SupplierBalancesQuery,
  SalesVsPosQuery,
  StockMovementsQuery,
} from '../validators/reports.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.use(requireRole('OWNER', 'MANAGER', 'AUDITOR'));

reportsRouter.get(
  '/daily-sales',
  validateQuery(DailySalesQuery),
  asyncHandler(reports.dailySales)
);

reportsRouter.get(
  '/reconciliations',
  validateQuery(ReconciliationQuery),
  asyncHandler(reports.reconciliations)
);

reportsRouter.get(
  '/handovers',
  validateQuery(HandoversQuery),
  asyncHandler(reports.handovers)
);

reportsRouter.get(
  '/expenses',
  validateQuery(ExpensesQuery),
  asyncHandler(reports.expenses)
);

reportsRouter.get(
  '/supplier-balances',
  validateQuery(SupplierBalancesQuery),
  asyncHandler(reports.supplierBalances)
);

reportsRouter.get(
  '/sales-vs-pos',
  validateQuery(SalesVsPosQuery),
  asyncHandler(reports.salesVsPos)
);

reportsRouter.get(
  '/stock-movements',
  validateQuery(StockMovementsQuery),
  asyncHandler(reports.stockMovements)
);