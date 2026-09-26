import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { ApiError } from '../errors/ApiError.js';
import { env } from '../config/env.js';

/**
 * POST /api/v1/expenses/attachments
 * multipart/form-data with a `file` field.
 * Returns { attachmentPath } — a path relative to ATTACHMENTS_ROOT.
 */
export async function uploadAttachment(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, 'NO_FILE', 'No file uploaded.');

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  const ext = pickExtension(req.file.mimetype);
  if (!ext) {
    throw new ApiError(400, 'BAD_FILE_TYPE', 'Only JPEG, PNG, or PDF are accepted.');
  }

  const filename = `${randomUUID()}.${ext}`;
  const relDir = join(yyyy, mm);
  const absDir = join(env.ATTACHMENTS_ROOT, relDir);
  const absPath = join(absDir, filename);
  const relPath = join(relDir, filename).replace(/\\/g, '/');

  await mkdir(absDir, { recursive: true });
  await writeFile(absPath, req.file.buffer);

  res.status(201).json({
    success: true,
    attachmentPath: relPath,
    bytes: req.file.size,
    mimeType: req.file.mimetype,
  });
}

function pickExtension(mime: string): string | null {
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'application/pdf':
      return 'pdf';
    default:
      return null;
  }
}