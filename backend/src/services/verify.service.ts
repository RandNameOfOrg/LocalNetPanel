import { Resolver } from 'dns/promises';
import crypto from 'crypto';
import { queryOne, execute } from '../db/db';
import { getDnsConfig, parseNameservers } from './bind.service';
import { badRequest, notFound } from '../lib/errors';
import { nowSeconds } from '../lib/sql';

/** TXT challenge host published under the domain, e.g. _panel-challenge.example.com. */
export const CHALLENGE_HOST = '_panel-challenge';
const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8'];

interface DomainRow {
  id: number; name: string; verify_token: string | null; verify_method: string | null;
}

/** Begin verification: issue a fresh token and record the chosen method. */
export async function startVerification(domainId: number, method: 'bind' | 'external') {
  const domain = await queryOne<DomainRow>('SELECT id, name FROM domains WHERE id = ?', [domainId]);
  if (!domain) throw notFound('Domain not found');

  const token = crypto.randomBytes(16).toString('hex');
  await execute(
    'UPDATE domains SET verify_token = ?, verify_method = ?, verified = 0, verified_at = NULL WHERE id = ?',
    [token, method, domainId],
  );
  return {
    method,
    token,
    record: { name: CHALLENGE_HOST, type: 'TXT', value: `panel-verify=${token}` },
    fqdn: `${CHALLENGE_HOST}.${domain.name}`,
  };
}

/** Resolvers to query: public ones for 'external', the configured BIND server's IP for 'bind'. */
async function resolversFor(method: string): Promise<string[]> {
  if (method === 'external') return PUBLIC_RESOLVERS;
  const cfg = await getDnsConfig();
  if (!cfg.device_id) throw badRequest('DNS server is not configured (needed for BIND verification)');
  const dev = await queryOne<{ ip: string }>('SELECT ip FROM devices WHERE id = ?', [cfg.device_id]);
  if (!dev) throw badRequest('Configured DNS device not found');
  return [dev.ip];
}

/** Resolve the TXT challenge and, if the token matches, mark the domain verified. */
export async function checkVerification(domainId: number) {
  const domain = await queryOne<DomainRow>(
    'SELECT id, name, verify_token, verify_method FROM domains WHERE id = ?', [domainId],
  );
  if (!domain) throw notFound('Domain not found');
  if (!domain.verify_token) throw badRequest('Verification has not been started for this domain');

  const method = domain.verify_method ?? 'bind';
  const servers = await resolversFor(method);
  const fqdn = `${CHALLENGE_HOST}.${domain.name}`;

  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  resolver.setServers(servers);

  let verified = false;
  try {
    const txt = await resolver.resolveTxt(fqdn);
    verified = txt.map(chunks => chunks.join('')).some(v => v.includes(`panel-verify=${domain.verify_token}`));
  } catch {
    verified = false; // NXDOMAIN / timeout / no record
  }

  if (verified) await execute('UPDATE domains SET verified = 1, verified_at = ? WHERE id = ?', [nowSeconds(), domainId]);
  return { verified, method, checked: fqdn, servers };
}

const normalizeNs = (s: string) => s.trim().toLowerCase().replace(/\.$/, '');

/**
 * Check (via public DNS) that `domainName`'s authoritative NS delegation points
 * at the panel's configured nameservers. Used to gate self-service onboarding:
 * a scoped user proves control by delegating their domain to our NS at the
 * registrar. Returns the configured + observed NS so the UI can guide the user.
 */
export async function checkDelegation(domainName: string) {
  const configured = parseNameservers((await getDnsConfig()).nameservers).map(normalizeNs);
  if (configured.length === 0) throw badRequest('No nameservers are configured in DNS settings');

  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  resolver.setServers(PUBLIC_RESOLVERS);

  let found: string[] = [];
  try {
    found = (await resolver.resolveNs(domainName)).map(normalizeNs);
  } catch {
    found = []; // NXDOMAIN / no delegation yet / timeout
  }

  // Delegated only when every configured NS appears in the public NS RRset.
  const delegated = configured.every(ns => found.includes(ns));
  return { delegated, configured, found };
}
