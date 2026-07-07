import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const isWin = process.platform === 'win32';

export interface DiscoveredHost {
  ip: string;
  mac: string;
}

/** Non-internal IPv4 interfaces, with their /24 base (e.g. "192.168.1"). */
export function getLocalIPv4() {
  const out: { address: string; base: string }[] = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const ni of iface ?? []) {
      // Node <18 used numeric family (4); newer uses 'IPv4'.
      const isV4 = ni.family === 'IPv4' || (ni.family as unknown as number) === 4;
      if (isV4 && !ni.internal) {
        out.push({ address: ni.address, base: ni.address.split('.').slice(0, 3).join('.') });
      }
    }
  }
  return out;
}

async function ping(ip: string): Promise<void> {
  const cmd = isWin ? `ping -n 1 -w 600 ${ip}` : `ping -c 1 -W 1 ${ip}`;
  try {
    await execAsync(cmd, { timeout: 1500 });
  } catch {
    /* host down / unreachable — ignore */
  }
}

/** Ping every host in a /24 to populate the ARP cache, bounded concurrency. */
async function pingSweep(base: string): Promise<void> {
  const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
  const concurrency = 64;
  for (let i = 0; i < ips.length; i += concurrency) {
    await Promise.all(ips.slice(i, i + concurrency).map(ping));
  }
}

const IP_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
const MAC_RE = /([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/;

function parseArpTable(stdout: string): DiscoveredHost[] {
  const hosts: DiscoveredHost[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const ip = line.match(IP_RE)?.[1];
    const macRaw = line.match(MAC_RE)?.[0];
    if (!ip || !macRaw) continue;
    const mac = macRaw.replace(/-/g, ':').toLowerCase();
    // Skip broadcast and IPv4/IPv6 multicast MACs.
    if (mac === 'ff:ff:ff:ff:ff:ff' || mac.startsWith('01:00:5e') || mac.startsWith('33:33')) continue;
    hosts.push({ ip, mac });
  }
  return hosts;
}

/** Read the OS neighbour/ARP table (`arp -a`, falling back to `ip neigh` on Linux). */
async function readArpTable(): Promise<DiscoveredHost[]> {
  try {
    return parseArpTable((await execAsync('arp -a', { timeout: 5000 })).stdout);
  } catch {
    if (!isWin) {
      try {
        return parseArpTable((await execAsync('ip neigh show', { timeout: 5000 })).stdout);
      } catch {
        /* fall through */
      }
    }
    return [];
  }
}

/**
 * Discover reachable hosts (IP + MAC) on every local /24 by pinging the subnet
 * and reading the resulting ARP table. Intended for an explicit "Scan" action.
 */
export async function discoverHosts(): Promise<DiscoveredHost[]> {
  const subnets = getLocalIPv4();
  await Promise.all(subnets.map(s => pingSweep(s.base)));

  const table = await readArpTable();
  const byIp = new Map<string, string>();
  for (const { ip, mac } of table) {
    if (!byIp.has(ip)) byIp.set(ip, mac);
  }
  return [...byIp.entries()]
    .map(([ip, mac]) => ({ ip, mac }))
    .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}
