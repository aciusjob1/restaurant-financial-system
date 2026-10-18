import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:os', () => ({ networkInterfaces: vi.fn() }));
import { networkInterfaces } from 'node:os';
import { listNetworkCandidates, systemAccess } from '../src/controllers/systemController.js';

const mocked = networkInterfaces as unknown as ReturnType<typeof vi.fn>;

function addr(address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false) {
  return { address, family, internal, netmask: '', mac: '', cidr: null, scopeid: 0 };
}

function callHandler() {
  const res = { json: vi.fn() } as unknown as import('express').Response;
  systemAccess({} as import('express').Request, res);
  return res.json.mock.calls[0][0];
}

describe('listNetworkCandidates / systemAccess', () => {
  beforeEach(() => mocked.mockReset());

  it('zero candidates → empty list, confident: false', () => {
    mocked.mockReturnValue({ lo: [addr('127.0.0.1', 'IPv4', true)] });
    expect(listNetworkCandidates()).toEqual([]);
    expect(callHandler()).toEqual({ candidates: [], confident: false });
  });

  it('one real Wi-Fi → one candidate, confident: true', () => {
    mocked.mockReturnValue({ 'Wi-Fi': [addr('192.168.1.10')] });
    const c = listNetworkCandidates();
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ address: '192.168.1.10', iface: 'Wi-Fi', private: true, linkLocal: false, likelyVirtual: false });
    expect(callHandler()).toEqual({ candidates: c, confident: true });
  });

  it('one real + one virtual → confident: true (virtual does not block)', () => {
    mocked.mockReturnValue({
      'Wi-Fi': [addr('192.168.1.10')],
      'vEthernet (WSL)': [addr('172.17.0.1')],
    });
    const c = listNetworkCandidates();
    const real = c.filter((x) => !x.likelyVirtual);
    expect(real).toHaveLength(1);
    expect(callHandler().confident).toBe(true);
  });

  it('two real non-virtual → confident: false', () => {
    mocked.mockReturnValue({
      'Wi-Fi': [addr('192.168.1.10')],
      Ethernet: [addr('10.0.0.5')],
    });
    expect(callHandler().confident).toBe(false);
  });

  it('link-local 169.254.x.x is flagged and does not count toward confident', () => {
    mocked.mockReturnValue({ 'Wi-Fi': [addr('169.254.12.34')] });
    const c = listNetworkCandidates();
    expect(c).toHaveLength(1);
    expect(c[0].linkLocal).toBe(true);
    expect(callHandler().confident).toBe(false);
  });

  it('real Wi-Fi + link-local → confident: true (link-local excluded from count)', () => {
    mocked.mockReturnValue({
      'Wi-Fi': [addr('192.168.1.10')],
      'Local Area Connection* 1': [addr('169.254.1.2')],
    });
    expect(callHandler().confident).toBe(true);
  });

  it('ignores IPv6', () => {
    mocked.mockReturnValue({ 'Wi-Fi': [addr('fe80::1', 'IPv6'), addr('192.168.1.10')] });
    expect(listNetworkCandidates()).toHaveLength(1);
  });
});