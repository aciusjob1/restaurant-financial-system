import { Router } from 'express';
import multer from 'multer';
import * as salesController from '../controllers/salesController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ManualSalesSummarySchema } from '../validators/sales.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../errors/ApiError.js';

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB is generous for a daily cash-up.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Trust nothing about the filename; only gate on a short allow-list
    // of MIME types, and even then we will re-parse text as CSV regardless.
    const allowed = new Set([
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'text/plain',
      'application/octet-stream',
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new ApiError(400, 'BAD_FILE_TYPE', 'Unsupported file type.'));
    }
    cb(null, true);
  },
});

export const salesRouter = Router();

salesRouter.use(requireAuth);

// Read: OWNER, MANAGER, AUDITOR
salesRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(salesController.listSummaries)
);
salesRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(salesController.getSummary)
);

// Manual entry: OWNER, MANAGER only
salesRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(ManualSalesSummarySchema),
  asyncHandler(salesController.createManualSummary)
);

// CSV import: OWNER, MANAGER only
salesRouter.post(
  '/import',
  requireRole('OWNER', 'MANAGER'),
  upload.single('file'),
  asyncHandler(salesController.importCsv)
);