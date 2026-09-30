import { Router } from 'express';
import * as supplierController from '../controllers/supplierController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateSupplierSchema,
  UpdateSupplierSchema,
  CreatePurchaseInvoiceSchema,
  UpdatePurchaseInvoiceSchema,
  CancelPurchaseInvoiceSchema,
  CreateSupplierPaymentSchema,
  VoidSupplierPaymentSchema,
  AllocatePaymentSchema,
  VoidAllocationSchema,
  CompletePurchaseInvoiceSchema,
  CompleteSupplierPaymentSchema,
} from '../validators/supplier.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { purchaseItemRouter } from './purchaseItemRoutes.js';

// ---------- /api/v1/suppliers ----------
export const supplierRouter = Router();
supplierRouter.use(requireAuth);

supplierRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.listSuppliers)
);
supplierRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.getSupplier)
);
supplierRouter.get(
  '/:id/balance',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.getSupplierBalance)
);
supplierRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateSupplierSchema),
  asyncHandler(supplierController.createSupplier)
);
supplierRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateSupplierSchema),
  asyncHandler(supplierController.updateSupplier)
);

// ---------- /api/v1/purchase-invoices ----------
export const purchaseInvoiceRouter = Router();
purchaseInvoiceRouter.use(requireAuth);

// Mounted before the /:id group so the literal path always matches.
purchaseInvoiceRouter.post(
  '/complete',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CompletePurchaseInvoiceSchema),
  asyncHandler(supplierController.completePurchase)
);

purchaseInvoiceRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.listInvoices)
);
purchaseInvoiceRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.getInvoice)
);
purchaseInvoiceRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreatePurchaseInvoiceSchema),
  asyncHandler(supplierController.createInvoice)
);
purchaseInvoiceRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdatePurchaseInvoiceSchema),
  asyncHandler(supplierController.updateInvoice)
);
purchaseInvoiceRouter.delete(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(supplierController.deleteDraftInvoice)
);
purchaseInvoiceRouter.post(
  '/:id/post',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(supplierController.postInvoice)
);
purchaseInvoiceRouter.post(
  '/:id/cancel',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CancelPurchaseInvoiceSchema),
  asyncHandler(supplierController.cancelInvoice)
);

// Nested items router
purchaseInvoiceRouter.use('/:id/items', purchaseItemRouter);

// ---------- /api/v1/supplier-payments ----------
export const supplierPaymentRouter = Router();
supplierPaymentRouter.use(requireAuth);

// Mounted before the /:id group so the literal path always matches.
supplierPaymentRouter.post(
  '/complete',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CompleteSupplierPaymentSchema),
  asyncHandler(supplierController.completePayment)
);

supplierPaymentRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.listPayments)
);
supplierPaymentRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(supplierController.getPayment)
);
supplierPaymentRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateSupplierPaymentSchema),
  asyncHandler(supplierController.createPayment)
);
supplierPaymentRouter.post(
  '/:id/void',
  requireRole('OWNER', 'MANAGER'),
  validateBody(VoidSupplierPaymentSchema),
  asyncHandler(supplierController.voidPayment)
);
supplierPaymentRouter.post(
  '/:id/allocations',
  requireRole('OWNER', 'MANAGER'),
  validateBody(AllocatePaymentSchema),
  asyncHandler(supplierController.allocatePayment)
);

// ---------- /api/v1/payment-allocations ----------
export const paymentAllocationRouter = Router();
paymentAllocationRouter.use(requireAuth);

paymentAllocationRouter.post(
  '/:id/void',
  requireRole('OWNER', 'MANAGER'),
  validateBody(VoidAllocationSchema),
  asyncHandler(supplierController.voidAllocation)
);