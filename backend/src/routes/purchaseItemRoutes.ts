import { Router } from 'express';
import * as itemController from '../controllers/purchaseItemController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ReplacePurchaseItemsSchema } from '../validators/purchaseItem.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mounted at /api/v1/purchase-invoices/:id/items
// The invoice id is a URL param on the parent router; we re-declare it here.
export const purchaseItemRouter = Router({ mergeParams: true });
purchaseItemRouter.use(requireAuth);

purchaseItemRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(itemController.listItems)
);

purchaseItemRouter.put(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(ReplacePurchaseItemsSchema),
  asyncHandler(itemController.replaceItems)
);