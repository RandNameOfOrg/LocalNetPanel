import path from 'path';
import { SFTPWrapper, Client } from 'ssh2';
import { queryOne, queryAll, execute } from '../db/db';
import { getDeviceAndCred, withSSH } from './ssh.service';
import { badRequest, notFound } from '../lib/errors';
import { nowSeconds } from '../lib/sql';

export interface DnsConfig {
  id: number;
  device_id: number | null;
  credential_id: number | null;
  include_path: string;
  zones_dir: string;
  reload_hook: string;
  nameservers: string; // newline/comma-separated authoritative NS hostnames
  allow_self_service: number; // 0/1 — allow scoped users to self-onboard domains via NS delegation
  updated_at: number;
}

export interface Domain {
  id: number; name: string; ttl: number; primary_ns: string; admin_email: string;
  verified: number; verify_token: string | null; verify_method: string | null; verified_at: number | null;
}

export interface DnsRecord {
  id: number; domain_id: number; name: string; type: string; value: string;
  ttl: number | null; priority: number | null; weight: number | null; port: number | null;
}

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS'] as const;

/** Load the single dns_config row, creating it with defaults on first access. */
export async function getDnsConfig(): Promise<DnsConfig> {
  let cfg = await queryOne<DnsConfig>('SELECT * FROM dns_config WHERE id = 1');
  if (!cfg) {
    await execute('INSERT INTO dns_config (id) VALUES (1)');
    cfg = await queryOne<DnsConfig>('SELECT * FROM dns_config WHERE id = 1');
  }
  return cfg!;
}

const ensureDot = (s: string) => (s.endsWith('.') ? s : `${s}.`);

/** Split the configured nameservers blob (newline/comma separated) into hostnames. */
export function parseNameservers(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}

/** A nameserver with a dot is treated as an FQDN; a bare label is relative to the zone. */
const nsToFqdn = (ns: string, domain: string) => (ns.includes('.') ? ensureDot(ns) : `${ns}.${domain}.`);

function recordLine(r: DnsRecord): string {
  const name = r.name || '@';
  const ttl = r.ttl != null ? ` ${r.ttl}` : '';
  const head = `${name}${ttl} IN ${r.type}`;
  switch (r.type) {
    case 'MX': return `${head} ${r.priority ?? 10} ${ensureDot(r.value)}`;
    case 'SRV': return `${head} ${r.priority ?? 0} ${r.weight ?? 0} ${r.port ?? 0} ${ensureDot(r.value)}`;
    case 'TXT': return `${head} "${r.value.replace(/"/g, '\\"')}"`;
    case 'CNAME':
    case 'NS': return `${head} ${ensureDot(r.value)}`;
    default: return `${head} ${r.value}`; // A / AAAA
  }
}

/**
 * Render a BIND zone file for one domain (SOA + apex NS + its records).
 * `globalNs` is the panel-wide authoritative NS list from DNS settings; when
 * empty the zone falls back to its own `primary_ns` (legacy behaviour).
 */
export function renderZone(d: Domain, records: DnsRecord[], globalNs: string[] = []): string {
  const nsHosts = (globalNs.length ? globalNs : [d.primary_ns]).map(ns => nsToFqdn(ns, d.name));
  const mname = nsHosts[0];
  const rname = d.admin_email.includes('@')
    ? `${d.admin_email.replace('@', '.')}.`
    : d.admin_email.includes('.') ? ensureDot(d.admin_email) : `${d.admin_email}.${d.name}.`;

  return [
    `$ORIGIN ${d.name}.`,
    `$TTL ${d.ttl}`,
    `@ IN SOA ${mname} ${rname} ( ${nowSeconds()} 3600 600 604800 3600 )`,
    ...nsHosts.map(ns => `@ IN NS ${ns}`),
    ...records.map(recordLine),
    '',
  ].join('\n');
}

/** Render the named.conf include that declares one master zone per domain. */
export function renderInclude(domains: Domain[], zonesDir: string): string {
  if (domains.length === 0) return '# No managed domains\n';
  return `${domains
    .map(d => `zone "${d.name}" {\n    type master;\n    file "${zonesDir}/db.${d.name}";\n};`)
    .join('\n\n')}\n`;
}

export interface DnsArtifacts {
  configured: boolean;
  includePath: string;
  includeContent: string;
  zones: { domain: string; path: string; content: string }[];
  reloadHook: string;
}

/** Build everything that would be written to BIND, without touching the server. */
export async function buildArtifacts(): Promise<DnsArtifacts> {
  const config = await getDnsConfig();
  const globalNs = parseNameservers(config.nameservers);
  const domains = await queryAll<Domain>('SELECT * FROM domains ORDER BY name');
  const zones = [];
  for (const d of domains) {
    const records = await queryAll<DnsRecord>('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [d.id]);
    zones.push({ domain: d.name, path: `${config.zones_dir}/db.${d.name}`, content: renderZone(d, records, globalNs) });
  }
  return {
    configured: !!(config.device_id && config.credential_id),
    includePath: config.include_path,
    includeContent: renderInclude(domains, config.zones_dir),
    zones,
    reloadHook: config.reload_hook,
  };
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function writeRemote(sftp: SFTPWrapper, remotePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath);
    ws.on('close', () => resolve());
    ws.on('error', reject);
    ws.end(Buffer.from(content, 'utf8'));
  });
}

function execOnConn(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d: Buffer) => { out += d.toString(); });
      stream.stderr.on('data', (d: Buffer) => { out += d.toString(); });
      stream.on('close', (code: number) =>
        code === 0 ? resolve(out.trim()) : reject(new Error(out.trim() || `Command exited with code ${code}`)));
    });
  });
}

/**
 * Connect to the configured DNS device, write the named.conf include plus the
 * given zone files over SFTP, then run the post-apply hook (e.g. rndc reload).
 * Returns the hook's combined output. Shared by the global and per-domain apply.
 */
async function pushToBind(
  config: DnsConfig,
  includeContent: string,
  zones: { path: string; content: string }[],
): Promise<string> {
  if (!config.device_id || !config.credential_id) throw badRequest('DNS server is not configured');
  const { device, cred } = await getDeviceAndCred(config.device_id, config.credential_id);

  return withSSH(device, cred, async conn => {
    const sftp = await new Promise<SFTPWrapper>((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
    await execOnConn(conn, `mkdir -p ${shellQuote(config.zones_dir)} ${shellQuote(path.posix.dirname(config.include_path))}`);
    await writeRemote(sftp, config.include_path, includeContent);
    for (const z of zones) await writeRemote(sftp, z.path, z.content);
    return execOnConn(conn, config.reload_hook);
  });
}

/** Render everything from the DB and push all zones + the include, then reload. */
export async function applyDns(): Promise<string> {
  const config = await getDnsConfig();
  const artifacts = await buildArtifacts();
  return pushToBind(config, artifacts.includeContent, artifacts.zones);
}

/**
 * Apply a single domain: rewrite the include (so the zone stays declared even
 * if it was just added) but push only this domain's zone file, then reload.
 */
export async function applyDomain(domainId: number): Promise<string> {
  const config = await getDnsConfig();
  const domain = await queryOne<Domain>('SELECT * FROM domains WHERE id = ?', [domainId]);
  if (!domain) throw notFound('Domain not found');

  const globalNs = parseNameservers(config.nameservers);
  const records = await queryAll<DnsRecord>('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [domainId]);
  const allDomains = await queryAll<Domain>('SELECT * FROM domains ORDER BY name');
  const zone = { path: `${config.zones_dir}/db.${domain.name}`, content: renderZone(domain, records, globalNs) };

  return pushToBind(config, renderInclude(allDomains, config.zones_dir), [zone]);
}
