import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async Express handler so a rejected promise is forwarded to
 * Express's error middleware via next(err). Express 4 does not do this
 * automatically; Express 5 does. We are on Express 4.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}