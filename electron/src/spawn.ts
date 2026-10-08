import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export type ManagedChild = {
  name: string;
  proc: ChildProcess;
  stop: () => Promise<void>;
};

function repoRoot(): string {
  // __dirname at runtime = electron/dist (after tsc)
  // repo root is two levels up
  return path.resolve(__dirname, '..', '..');
}

function prefixStream(name: string, stream: NodeJS.ReadableStream | null, isErr: boolean) {
  if (!stream) return;
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const tag = isErr ? '[spawn:' + name + ':err]' : '[spawn:' + name + ']';
      console.log(tag + ' ' + line);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      const tag = isErr ? '[spawn:' + name + ':err]' : '[spawn:' + name + ']';
      console.log(tag + ' ' + buffer);
      buffer = '';
    }
  });
}

export function startBackend(): ManagedChild {
  const root = repoRoot();
  const cwd = path.join(root, 'backend');
  const entry = path.join(cwd, 'dist', 'server.js');

  const proc = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  prefixStream('api', proc.stdout, false);
  prefixStream('api', proc.stderr, true);

  proc.on('exit', (code, signal) => {
    console.log('[spawn:api] exited code=' + code + ' signal=' + signal);
  });
  proc.on('error', (err) => {
    console.error('[spawn:api] failed to start:', err.message);
  });

  return {
    name: 'api',
    proc,
    stop: () =>
      new Promise<void>((resolve) => {
        if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
        const timer = setTimeout(() => {
          console.warn('[spawn:api] kill timeout — forcing');
          try { proc.kill('SIGKILL'); } catch {}
          resolve();
        }, 5000);
        proc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        try { proc.kill('SIGTERM'); } catch {}
      }),
  };
}