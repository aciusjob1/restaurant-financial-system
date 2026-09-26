import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { CreateUserSchema, UpdateUserSchema } from '../validators/user.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const userRouter = Router();

// Every route in this file requires an active, authenticated OWNER.
userRouter.use(requireAuth);
userRouter.use(requireRole('OWNER'));

userRouter.get('/', asyncHandler(userController.listUsers));
userRouter.post('/', validateBody(CreateUserSchema), asyncHandler(userController.createUser));
userRouter.get('/:id', asyncHandler(userController.getUser));
userRouter.patch('/:id', validateBody(UpdateUserSchema), asyncHandler(userController.updateUser));