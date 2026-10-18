import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRouter } from './routes/authRoutes.js';
import { userRouter } from './routes/userRoutes.js';
import { positionRouter } from './routes/positionRoutes.js';
import { employeeRouter } from './routes/employeeRoutes.js';
import { shiftRouter } from './routes/shiftRoutes.js';
import { salesRouter } from './routes/salesRoutes.js';
import { collectionRouter } from './routes/collectionRoutes.js';
import { reconciliationRouter } from './routes/reconciliationRoutes.js';
import { handoverRouter } from './routes/handoverRoutes.js';
import { dailyCashReceiptRouter } from './routes/dailyCashReceiptRoutes.js';
import { closingRouter } from './routes/closingRoutes.js';
import { expenseRouter, expenseCategoryRouter } from './routes/expenseRoutes.js';
import { salaryRouter, salaryPaymentRouter } from './routes/salaryRoutes.js';
import {
  supplierRouter,
  purchaseInvoiceRouter,
  supplierPaymentRouter,
  paymentAllocationRouter,
} from './routes/supplierRoutes.js';
import {
  materialRouter,
  materialCategoryRouter,
} from './routes/materialRoutes.js';
import { reportsRouter } from './routes/reportsRoutes.js';
import { settingsRouter } from './routes/settingsRoutes.js';
import { backupRouter } from './routes/backupRoutes.js';
import { systemRouter } from './routes/systemRoutes.js';
import { stockMovementRouter } from './routes/stockMovementRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
  helmet({
    // Allow cross-origin subresource loads. In dev the frontend runs
    // on :3000 and the API on :4000, so any browser-subresource load
    // (like the restaurant logo <img>) would otherwise be blocked by
    // helmet's default Cross-Origin-Resource-Policy: same-origin.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'rfs-backend', env: env.NODE_ENV });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/positions', positionRouter);
  app.use('/api/v1/employees', employeeRouter);
  app.use('/api/v1/shifts', shiftRouter);
  app.use('/api/v1/sales-summaries', salesRouter);
  app.use('/api/v1/collections', collectionRouter);
  app.use('/api/v1/reconciliations', reconciliationRouter);
  app.use('/api/v1/handovers', handoverRouter);
  app.use('/api/v1/daily-cash-receipts', dailyCashReceiptRouter);
  app.use('/api/v1/daily-closings', closingRouter);
  app.use('/api/v1/expense-categories', expenseCategoryRouter);
  app.use('/api/v1/expenses', expenseRouter);
  app.use('/api/v1/salaries', salaryRouter);
  app.use('/api/v1/salary-payments', salaryPaymentRouter);
  app.use('/api/v1/suppliers', supplierRouter);
  app.use('/api/v1/purchase-invoices', purchaseInvoiceRouter);
  app.use('/api/v1/supplier-payments', supplierPaymentRouter);
  app.use('/api/v1/payment-allocations', paymentAllocationRouter);
  app.use('/api/v1/material-categories', materialCategoryRouter);
  app.use('/api/v1/materials', materialRouter);
app.use('/api/v1/stock-movements', stockMovementRouter);
app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/backups', backupRouter);
  app.use('/api/v1/system', systemRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}