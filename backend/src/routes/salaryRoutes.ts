import { Router } from 'express';
import * as salaryController from '../controllers/salaryController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateSalaryRecordSchema,
  UpdateSalaryRecordSchema,
  CreateSalaryPaymentSchema,
  VoidSalaryPaymentSchema,
} from '../validators/salary.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const salaryRouter = Router();
salaryRouter.use(requireAuth);

salaryRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(salaryController.listSalaries)
);
salaryRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(salaryController.getSalary)
);
salaryRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateSalaryRecordSchema),
  asyncHandler(salaryController.createSalary)
);
salaryRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateSalaryRecordSchema),
  asyncHandler(salaryController.updateSalary)
);
salaryRouter.post(
  '/:id/approve',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(salaryController.approveSalary)
);

export const salaryPaymentRouter = Router();
salaryPaymentRouter.use(requireAuth);

salaryPaymentRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(salaryController.listSalaryPayments)
);
salaryPaymentRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(salaryController.getSalaryPayment)
);
salaryPaymentRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateSalaryPaymentSchema),
  asyncHandler(salaryController.createSalaryPayment)
);
salaryPaymentRouter.post(
  '/:id/void',
  requireRole('OWNER', 'MANAGER'),
  validateBody(VoidSalaryPaymentSchema),
  asyncHandler(salaryController.voidSalaryPayment)
);