import type { Request, Response } from 'express';
import { authenticateUser, authenticateByPin, changePassword, updateMyProfile, setPin } from '../services/authService.js';
import {
  createSession,
  setSessionCookie,
  revokeSessionByToken,
  clearSessionCookie,
} from '../lib/session.js';
import { env } from '../config/env.js';
import { closeStaleOpenShiftsForUser } from '../services/shiftAutoCloseService.js';
import type { LoginInput, LoginPinInput, ChangePasswordInput, SetPinInput, UpdateMyProfileInput } from '../validators/auth.js';

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginInput;
  const user = await authenticateUser({ username, password });

  const { token, expiresAt } = await createSession({
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  setSessionCookie(res, token, expiresAt);

  // Per-user backstop: if this user has an OPEN shift from a prior
  // business date, close it now so their next write can auto-open a
  // fresh shift. Never blocks login — a failure here is logged only.
  try {
    await closeStaleOpenShiftsForUser(user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[auth] stale-shift cleanup failed for', user.username, msg);
  }

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

/**
 * PIN login for waiters. Same session mechanics as `login`; same
 * stale-shift backstop. Uniform 401 INVALID_CREDENTIALS from the service
 * for every failure mode (unknown user, no PIN, wrong PIN, locked,
 * inactive, non-WAITER).
 */
export async function loginWithPin(req: Request, res: Response) {
  const { username, pin } = req.body as LoginPinInput;
  const user = await authenticateByPin({ username, pin });

  const { token, expiresAt } = await createSession({
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  setSessionCookie(res, token, expiresAt);

  try {
    await closeStaleOpenShiftsForUser(user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[auth] stale-shift cleanup failed for', user.username, msg);
  }

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

/**
 * Manager/owner sets or resets a waiter's PIN. The PIN itself is never
 * returned in the response. Only the target user id and username.
 */
export async function setUserPin(req: Request, res: Response) {
  const { userId, pin } = req.body as SetPinInput;
  const result = await setPin({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    targetUserId: userId,
    pin,
  });
  res.json({ success: true, user: result });
}
