import { Router } from 'express';
import * as employeeController from '../controllers/employeeController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { CreateEmployeeSchema, UpdateEmployeeSchema } from '../validators/employee.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const employeeRouter = Router();

employeeRouter.use(requireAuth);

employeeRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(employeeController.listEmployees)
);
employeeRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(employeeController.getEmployee)
);
employeeRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateEmployeeSchema),
  asyncHandler(employeeController.createEmployee)
);
employeeRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateEmployeeSchema),
  asyncHandler(employeeController.updateEmployee)
);

employeeRouter.post(
  '/:id/deactivate',
  requireRole('OWNER'),
  asyncHandler(employeeController.deactivateEmployee)
);
