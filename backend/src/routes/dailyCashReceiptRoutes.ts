import { Router } from 'express';
import * as controller from '../controllers/dailyCashReceiptController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { UpsertReceiptSchema } from '../validators/dailyCashReceipt.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dailyCashReceiptRouter = Router();

dailyCashReceiptRouter.use(requireAuth);
dailyCashReceiptRouter.get('/mine', asyncHandler(controller.getMine));
dailyCashReceiptRouter.get(
  '/',
  // Same role set as /ops/cash in the UI. Without this, any
  // authenticated user (including a waiter) could list every waiter's
  // daily cash for a date. The UI hid the page; the API must gate it.
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(controller.list)
);
dailyCashReceiptRouter.post(
  '/',
  requireRole('MANAGER', 'OWNER'),
  validateBody(UpsertReceiptSchema),
  asyncHandler(controller.upsert)
);