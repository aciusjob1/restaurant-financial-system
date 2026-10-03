import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { env } from '../config/env.js';

// Accepted logo MIME types. Strictly narrower than the receipt-attachment
// upload (which also allows PDF): a logo is a public-facing brand asset
// and there is no reason to accept anything else here.
export type LogoMime = 'image/png' | 'image/jpeg' | 'image/webp';

const EXT_BY_MIME: Record<LogoMime, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const MIME_BY_EXT: Record<string, LogoMime> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const MAX_LOGO_BYTES = 1 * 1024 * 1024;

// Magic-byte sniffing. Multer's fileFilter only sees the client-declared
// mimetype; a renamed file can lie about that. This check reads the first
// bytes of the actual buffer, so a payload renamed to .png still fails.
//
// Deliberately stricter than attachmentController (which trusts the declared
// mimetype) — this asymmetry is intentional for a publicly-served asset.
export function sniffLogoMime(buf: Buffer): LogoMime | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: 'RIFF' ....  'WEBP'
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

function absRoot(): string {
  return resolve(process.cwd(), env.ATTACHMENTS_ROOT);
}

function restaurantDir(): string {
  return join(absRoot(), 'restaurant');
}

// Paths stored in Setting are relative to ATTACHMENTS_ROOT and use '/'
// as separator so they're stable across OSes.
function relFromBuffer(mime: LogoMime): string {
  const ext = EXT_BY_MIME[mime];
  return 'restaurant/logo-' + randomUUID() + '.' + ext;
}

export async function saveLogo(buf: Buffer): Promise<{ relPath: string; mime: LogoMime; bytes: number }> {
  const mime = sniffLogoMime(buf);
  if (!mime) {
    throw new Error('sniff-failed');
  }
  const relPath = relFromBuffer(mime);
  const absPath = join(absRoot(), relPath);
  await mkdir(restaurantDir(), { recursive: true });
  await writeFile(absPath, buf);
  return { relPath, mime, bytes: buf.length };
}

// Resolves a stored relative path back to an absolute one, refusing to
// escape the attachments root. Returns null when the file is missing.
export async function resolveLogo(relPath: string): Promise<{
  absPath: string;
  mime: LogoMime;
  bytes: number;
} | null> {
  if (!relPath) return null;

  const root = absRoot();
  const absPath = resolve(root, relPath);
  if (!absPath.startsWith(root + sep)) return null;

  const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;

  try {
    const st = await stat(absPath);
    if (!st.isFile()) return null;
    return { absPath, mime, bytes: st.size };
  } catch {
    return null;
  }
}

// Best-effort removal. A missing or unreadable file is not an error.
export async function removeLogo(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  const root = absRoot();
  const absPath = resolve(root, relPath);
  if (!absPath.startsWith(root + sep)) return;
  try {
    await unlink(absPath);
  } catch {
    // ignore
  }
}
