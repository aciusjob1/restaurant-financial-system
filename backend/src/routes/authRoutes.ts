import { Router } from 'express';
import { login, logout, me, changeMyPassword } from '../controllers/authController.js';
import { validateBody } from '../middleware/validate.js';
import { LoginSchema, ChangePasswordSchema } from '../validators/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validateBody(LoginSchema), asyncHandler(login));
authRouter.post('/logout', asyncHandler(logout));
authRouter.get('/me', requireAuth, me);
authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(ChangePasswordSchema),
  asyncHandler(changeMyPassword)
);
