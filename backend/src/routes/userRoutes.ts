import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { CreateUserSchema, UpdateUserSchema, ResetPasswordSchema } from '../validators/user.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(userController.listUsers)
);
userRouter.post(
  '/',
  requireRole('OWNER'),
  validateBody(CreateUserSchema),
  asyncHandler(userController.createUser)
);
userRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(userController.getUser)
);
userRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateUserSchema),
  asyncHandler(userController.updateUser)
);
userRouter.post(
  '/:id/reset-password',
  requireRole('OWNER', 'MANAGER'),
  validateBody(ResetPasswordSchema),
  asyncHandler(userController.resetPassword)
);
