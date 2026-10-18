import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export type ManagedChild = {
  name: string;
  proc: ChildProcess;
  port: number;
  stop: () => Promise<void>;
};

function repoRoot(): string {
  // __dirname at runtime = electron/dist
  return path.resolve(__dirname, '..', '..');
}

function prefixStream(name: string, stream: NodeJS.ReadableStream | null, isErr: boolean) {
  if (!stream) return;
  let buffer = '';
  const tag = isErr ? '[spawn:' + name + ':err]' : '[spawn:' + name + ']';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      console.log(tag + ' ' + line);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      console.log(tag + ' ' + buffer);
      buffer = '';
    }
  });
}

function makeStop(name: string, proc: ChildProcess): () => Promise<void> {
  return () =>
    new Promise<void>((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
      const timer = setTimeout(() => {
        console.warn('[spawn:' + name + '] kill timeout — forcing');
        try { proc.kill('SIGKILL'); } catch {}
        resolve();
      }, 5000);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try { proc.kill('SIGTERM'); } catch {}
    });
}

export function startBackend(port: number): ManagedChild {
  const cwd = path.join(repoRoot(), 'backend');
  const entry = path.join(cwd, 'dist', 'server.js');
  const isDev = process.env.RFS_DEV === '1';

  const proc = spawn(process.execPath, [entry], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: String(port),
    },
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

  return { name: 'api', proc, port, stop: makeStop('api', proc) };
}

export function startFrontend(port: number): ManagedChild {
  const cwd = path.join(repoRoot(), 'frontend');
  const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');

  // Dev mode runs "next dev" (compiles on request). Production runs "next start".
  const isDev = process.env.RFS_DEV === '1';
  const args = isDev
    ? ['dev', '-H', '0.0.0.0', '-p', String(port)]
    : ['start', '-H', '0.0.0.0', '-p', String(port)];
  const proc = spawn(process.execPath, [nextBin, ...args], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  prefixStream('web', proc.stdout, false);
  prefixStream('web', proc.stderr, true);

  proc.on('exit', (code, signal) => {
    console.log('[spawn:web] exited code=' + code + ' signal=' + signal);
  });
  proc.on('error', (err) => {
    console.error('[spawn:web] failed to start:', err.message);
  });

  return { name: 'web', proc, port, stop: makeStop('web', proc) };
}