import type { Request, Response } from 'express';
import { networkInterfaces } from 'node:os';

type Candidate = {
  address: string;
  iface: string;
  private: boolean;       // RFC1918 range clue — NOT proof of reachability
  linkLocal: boolean;     // 169.254.x.x — self-assigned, not a Wi-Fi address
  likelyVirtual: boolean; // interface-name heuristic — NOT proof
};

const VIRTUAL_IFACE_HINTS = [
  'docker', 'veth', 'vethernet', 'vmware', 'virtualbox', 'vboxnet',
  'hyper-v', 'tailscale', 'zerotier', 'wg', 'tap', 'tun',
  'npcap', 'bluetooth',
];

function looksVirtual(name: string, addr: string): boolean {
  const n = name.toLowerCase();
  // 1. Filter by interface name
  if (VIRTUAL_IFACE_HINTS.some((h) => n.includes(h))) return true;
  
  // 2. Filter by known virtual IP ranges (VirtualBox, Docker, etc.)
  // VirtualBox Host-Only defaults to 192.168.56.x
  if (addr.startsWith('192.168.56.')) return true;
  // Docker defaults to 192.168.99.x
  if (addr.startsWith('192.168.99.')) return true;
  
  return false;
}

function isPrivateV4(addr: string): boolean {
  const o = addr.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = o;
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isLinkLocalV4(addr: string): boolean {
  return addr.startsWith('169.254.');
}

export function listNetworkCandidates(): Candidate[] {
  const out: Candidate[] = [];
  const ifaces = networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      const isV4 = a.family === 'IPv4' || (a.family as unknown as number) === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      out.push({
        address: a.address,
        iface: name,
        private: isPrivateV4(a.address),
        linkLocal: isLinkLocalV4(a.address),
        likelyVirtual: looksVirtual(name, a.address),
      });
    }
  }
  out.sort((x, y) => {
    if (x.linkLocal !== y.linkLocal) return x.linkLocal ? 1 : -1;
    if (x.likelyVirtual !== y.likelyVirtual) return x.likelyVirtual ? 1 : -1;
    return x.address.localeCompare(y.address);
  });
  return out;
}

export function systemAccess(_req: Request, res: Response) {
  const candidates = listNetworkCandidates();
  // "confident" = exactly one candidate that is neither link-local nor
  // name-flagged virtual. It does NOT mean the address is reachable,
  // belongs to the restaurant Wi-Fi, or will work from a phone.
  const usable = candidates.filter((c) => !c.linkLocal && !c.likelyVirtual);
  const confident = usable.length === 1;
  res.json({ candidates, confident });
}