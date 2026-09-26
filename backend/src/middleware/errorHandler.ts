import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/ApiError.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Not found.' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request.',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof ApiError) {
    const body: Record<string, unknown> = {
      success: false,
      code: err.code,
      message: err.message,
    };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  console.error('[error]', err);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Unable to complete the operation.',
  });
}