import { Router } from 'express';
import * as shiftController from '../controllers/shiftController.js';
import * as shiftCloseController from '../controllers/shiftCloseController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { StartShiftSchema, TransitionShiftSchema, SetOpeningCashSchema } from '../validators/shift.js';
import { CloseMoneySchema, CompleteShiftSchema, SubmitShiftSchema } from '../validators/shiftClose.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const shiftRouter = Router();

shiftRouter.use(requireAuth);

// Read: all authenticated roles.
// Ownership filtering happens in the service (WAITER sees only their own).
shiftRouter.get('/', asyncHandler(shiftController.listShifts));
shiftRouter.get('/:id', asyncHandler(shiftController.getShift));

// Start a shift: WAITER (their own), MANAGER, OWNER.
// WAITER cannot start a shift for anyone else; enforced in service.
shiftRouter.post(
  '/',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  validateBody(StartShiftSchema),
  asyncHandler(shiftController.startShift)
);

// Transition a shift: state machine is enforced in the service, and is
// role-aware. AUDITOR can never transition.
shiftRouter.post(
  '/:id/transition',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  validateBody(TransitionShiftSchema),
  asyncHandler(shiftController.transitionShift)
);
// Recovery: MANAGER/OWNER supplies missing opening cash on an already-OPEN shift.
// Set-once; 409 if already populated.
shiftRouter.post(
  '/:id/opening-cash',
  requireRole('MANAGER', 'OWNER'),
  validateBody(SetOpeningCashSchema),
  asyncHandler(shiftController.setOpeningCash)
);

shiftRouter.post(
  '/:id/close-money',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CloseMoneySchema),
  asyncHandler(shiftCloseController.closeMoney)
);

shiftRouter.post(
  '/:id/complete-shift',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CompleteShiftSchema),
  asyncHandler(shiftCloseController.completeShift)
);

shiftRouter.post(
  '/:id/submit',
  requireRole('OWNER', 'MANAGER'),
  validateBody(SubmitShiftSchema),
  asyncHandler(shiftCloseController.submitShift)
);
