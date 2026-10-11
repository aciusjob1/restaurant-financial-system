import { Router } from 'express';
import { login, loginWithPin, loginPinOnly, setUserPin, logout, me, changeMyPassword, updateMe } from '../controllers/authController.js';
import { validateBody } from '../middleware/validate.js';
import { LoginSchema, LoginPinSchema, LoginPinOnlySchema, SetPinSchema, ChangePasswordSchema, UpdateMyProfileSchema } from '../validators/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { loginLimiter, loginPinLimiter, loginPinOnlyLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validateBody(LoginSchema), asyncHandler(login));
authRouter.post('/login-pin', loginPinLimiter, validateBody(LoginPinSchema), asyncHandler(loginWithPin));
authRouter.post('/login-pin-only', loginPinOnlyLimiter, validateBody(LoginPinOnlySchema), asyncHandler(loginPinOnly));
authRouter.post(
  '/set-pin',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  validateBody(SetPinSchema),
  asyncHandler(setUserPin)
);
authRouter.post('/logout', asyncHandler(logout));
authRouter.get('/me', requireAuth, me);
authRouter.patch(
  '/me',
  requireAuth,
  validateBody(UpdateMyProfileSchema),
  asyncHandler(updateMe)
);
authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(ChangePasswordSchema),
  asyncHandler(changeMyPassword)
);
