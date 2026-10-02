import { Router } from 'express';
import multer from 'multer';
import * as expenseController from '../controllers/expenseController.js';
import * as attachmentController from '../controllers/attachmentController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateExpenseCategorySchema,
  UpdateExpenseCategorySchema,
  CreateExpenseSchema,
  UpdateExpenseSchema,
  RejectExpenseSchema,
  BulkApproveExpensesSchema,
} from '../validators/expense.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../errors/ApiError.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);
    if (!allowed.has(file.mimetype)) {
      return cb(new ApiError(400, 'BAD_FILE_TYPE', 'Only JPEG, PNG, or PDF are accepted.'));
    }
    cb(null, true);
  },
});

export const expenseCategoryRouter = Router();
expenseCategoryRouter.use(requireAuth);

expenseCategoryRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR', 'WAITER'),
  asyncHandler(expenseController.listCategories)
);
expenseCategoryRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(expenseController.getCategory)
);
expenseCategoryRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateExpenseCategorySchema),
  asyncHandler(expenseController.createCategory)
);
expenseCategoryRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateExpenseCategorySchema),
  asyncHandler(expenseController.updateCategory)
);

export const expenseRouter = Router();
expenseRouter.use(requireAuth);

// Attachment upload must be defined before /:id routes so "attachments"
// is not parsed as an id.
expenseRouter.post(
  '/attachments',
  requireRole('OWNER', 'MANAGER'),
  attachmentUpload.single('file'),
  asyncHandler(attachmentController.uploadAttachment)
);

expenseRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR', 'WAITER'),
  asyncHandler(expenseController.listExpenses)
);
// Bulk routes must come before /:id so 'bulk-approve' is not parsed as an id.
expenseRouter.post(
  '/bulk-approve',
  requireRole('OWNER', 'MANAGER'),
  validateBody(BulkApproveExpensesSchema),
  asyncHandler(expenseController.bulkApproveExpenses)
);
expenseRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(expenseController.getExpense)
);

expenseRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER', 'WAITER'),
  validateBody(CreateExpenseSchema),
  asyncHandler(expenseController.createExpense)
);
expenseRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'WAITER'),
  validateBody(UpdateExpenseSchema),
  asyncHandler(expenseController.updateExpense)
);
expenseRouter.post(
  '/:id/submit',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(expenseController.submitExpense)
);
expenseRouter.post(
  '/:id/approve',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(expenseController.approveExpense)
);
expenseRouter.post(
  '/:id/reject',
  requireRole('OWNER', 'MANAGER'),
  validateBody(RejectExpenseSchema),
  asyncHandler(expenseController.rejectExpense)
);