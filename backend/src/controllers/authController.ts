import type { Request, Response } from 'express';
import { authenticateUser, changePassword, updateMyProfile } from '../services/authService.js';
import {
  createSession,
  setSessionCookie,
  revokeSessionByToken,
  clearSessionCookie,
} from '../lib/session.js';
import { env } from '../config/env.js';
import type { LoginInput, ChangePasswordInput, UpdateMyProfileInput } from '../validators/auth.js';

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginInput;
  const user = await authenticateUser({ username, password });

  const { token, expiresAt } = await createSession({
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  setSessionCookie(res, token, expiresAt);

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      language: user.language ?? null,
    },
  });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (typeof token === 'string' && token.length > 0) {
    await revokeSessionByToken(token);
  }
  clearSessionCookie(res);
  res.json({ success: true });
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, user: req.user });
}

export async function changeMyPassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await changePassword({ userId: req.user!.id, currentPassword, newPassword });
  clearSessionCookie(res);
  res.json({ success: true, message: 'Password changed. Please sign in again.' });
}

export async function updateMe(req: Request, res: Response) {
  const input = req.body as UpdateMyProfileInput;
  const user = await updateMyProfile(req.user!.id, input);
  res.json({ success: true, user });
}
