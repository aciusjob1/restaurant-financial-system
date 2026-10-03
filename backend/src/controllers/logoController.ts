import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { ApiError } from '../errors/ApiError.js';
import { getSetting, setSettingInternal } from '../services/settingsService.js';
import * as logoService from '../services/logoService.js';

export async function uploadLogo(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, 'NO_FILE', 'No file uploaded.');
  if (req.file.size > logoService.MAX_LOGO_BYTES) {
    throw new ApiError(400, 'FILE_TOO_LARGE', 'Logo must be 1 MB or smaller.');
  }

  let saved;
  try {
    saved = await logoService.saveLogo(req.file.buffer);
  } catch {
    // sniffLogoMime returned null; the buffer is not a real PNG/JPEG/WebP.
    throw new ApiError(400, 'BAD_FILE_TYPE', 'Logo must be a real PNG, JPEG, or WebP file.');
  }

  // Replace-then-delete: read the old path, write the new, update the
  // setting, then best-effort unlink the old file. If the DB write fails,
  // the old file is left on disk — that is preferable to losing a logo
  // that is still referenced by the setting row.
  const previous = await getSetting('restaurant.logoPath');
  await setSettingInternal('restaurant.logoPath', saved.relPath);
  if (previous && previous !== saved.relPath) {
    await logoService.removeLogo(previous);
  }

  res.status(201).json({
    success: true,
    logoPath: saved.relPath,
    mime: saved.mime,
    bytes: saved.bytes,
  });
}

export async function getLogo(_req: Request, res: Response) {
  const relPath = await getSetting('restaurant.logoPath');
  if (!relPath) throw new ApiError(404, 'NO_LOGO', 'No logo set.');

  const resolved = await logoService.resolveLogo(relPath);
  if (!resolved) throw new ApiError(404, 'LOGO_MISSING', 'Logo file is missing.');

  res.setHeader('Content-Type', resolved.mime);
  res.setHeader('Cache-Control', 'private, max-age=60');
  createReadStream(resolved.absPath).pipe(res);
}

export async function deleteLogo(_req: Request, res: Response) {
  const relPath = await getSetting('restaurant.logoPath');
  await setSettingInternal('restaurant.logoPath', '');
  if (relPath) {
    await logoService.removeLogo(relPath);
  }
  res.json({ success: true });
}
