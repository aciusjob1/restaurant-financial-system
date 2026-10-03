import { Router } from 'express';
import multer from 'multer';
import * as settingsController from '../controllers/settingsController.js';
import * as logoController from '../controllers/logoController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { UpdateSettingsSchema } from '../validators/settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(settingsController.listSettings)
);

settingsRouter.patch(
  '/',
  requireRole('OWNER'),
  validateBody(UpdateSettingsSchema),
  asyncHandler(settingsController.updateSettings)
);

// Logo upload. Multer holds the file in memory; the controller does the
// magic-byte check. 1 MB limit is enforced twice (multer + controller) so
// the error message is specific regardless of where it fires.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('BAD_FILE_TYPE'));
    }
    cb(null, true);
  },
});

settingsRouter.post(
  '/restaurant/logo',
  requireRole('OWNER'),
  logoUpload.single('file'),
  asyncHandler(logoController.uploadLogo)
);

settingsRouter.get(
  '/restaurant/logo',
  requireRole('OWNER', 'MANAGER', 'AUDITOR', 'WAITER'),
  asyncHandler(logoController.getLogo)
);

settingsRouter.delete(
  '/restaurant/logo',
  requireRole('OWNER'),
  asyncHandler(logoController.deleteLogo)
);
