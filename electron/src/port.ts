import * as net from 'node:net';

function isFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

export async function pickPort(candidates: number[], host = '0.0.0.0'): Promise<number> {
  for (const p of candidates) {
    if (await isFree(p, host)) return p;
  }
  throw new Error('No free port among: ' + candidates.join(', '));
}