import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    // Replace query with parsed/coerced values. Cast is safe: Express
    // treats req.query as a mutable record.
    // Express types req.query as ParsedQs; parsed Zod output is a plain
    // object. Narrow at the assignment boundary rather than fight the type.
    (req as unknown as { query: unknown }).query = result.data;
    next();
  };
}