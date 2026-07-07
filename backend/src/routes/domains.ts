import { Router, type Request } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, execute } from '../db/db';
import { asyncHandler, parseBody, intParam } from '../lib/http';
import { buildUpdate } from '../lib/sql';
import { badRequest, notFound, forbidden } from '../lib/errors';
import { userHasPermission } from '../lib/permissions';
import { requirePermission } from '../middleware/auth.middleware';
import { getDnsConfig, buildArtifacts, applyDns, applyDomain, parseNameservers } from '../services/bind.service';
import { startVerification, checkVerification, checkDelegation } from '../services/verify.service';

const router = Router();

// This router is mounted behind requirePermission('domains'); holders of
// 'manage_domains' pass too (it implies 'domains'). Server-wide/admin actions
// below are additionally gated with `manageAll`; per-domain actions are scoped
// to ownership via `assertDomainAccess`.
const manageAll = requirePermission('manage_domains');
const canManageAll = (req: Request) => userHasPermission(req.user, 'manage_domains');

/** Throw 404 unless the domain exists and the caller may manage it. */
async function assertDomainAccess(req: Request, domainId: number): Promise<void> {
  if (!(await queryOne('SELECT 1 FROM domains WHERE id = ?', [domainId]))) throw notFound('Domain not found');
  if (canManageAll(req)) return;
  const owned = await queryOne(
    'SELECT 1 FROM domain_users WHERE domain_id = ? AND user_id = ?',
    [domainId, req.user!.userId],
  );
  if (!owned) throw notFound('Domain not found'); // don't reveal domains the user can't manage
}

const VerifySchema = z.object({ method: z.enum(['bind', 'external']).default('bind') });

const ConfigSchema = z.object({
  device_id: z.number().int().nullable().optional(),
  credential_id: z.number().int().nullable().optional(),
  include_path: z.string().min(1).optional(),
  zones_dir: z.string().min(1).optional(),
  reload_hook: z.string().min(1).optional(),
  nameservers: z.string().optional(), // newline/comma-separated; empty string clears
  allow_self_service: z.number().int().min(0).max(1).optional(),
});

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const DomainSchema = z.object({
  name: z.string().regex(DOMAIN_RE, 'Invalid domain name'),
  ttl: z.number().int().min(60).default(3600),
  primary_ns: z.string().min(1).default('ns1'),
  admin_email: z.string().min(1).default('admin'),
});

const RecordSchema = z.object({
  name: z.string().default('@'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS']),
  value: z.string().min(1),
  ttl: z.number().int().min(0).nullable().optional(),
  priority: z.number().int().min(0).nullable().optional(),
  weight: z.number().int().min(0).nullable().optional(),
  port: z.number().int().min(0).max(65535).nullable().optional(),
});

const AssignSchema = z.object({ userIds: z.array(z.number().int()) });

// --- DNS server config (managers only) ---
router.get('/config', manageAll, asyncHandler(async (_req, res) => {
  res.json(await getDnsConfig());
}));

router.put('/config', manageAll, asyncHandler(async (req, res) => {
  const data = parseBody(ConfigSchema, req.body);
  const { clause, values } = buildUpdate(data as Record<string, unknown>);
  await execute(`UPDATE dns_config SET ${clause}, updated_at = unixepoch() WHERE id = 1`, [...values]);
  res.json(await getDnsConfig());
}));

// Configured nameservers + self-service flag — needed by scoped users when onboarding a domain.
router.get('/nameservers', asyncHandler(async (_req, res) => {
  const cfg = await getDnsConfig();
  res.json({ nameservers: parseNameservers(cfg.nameservers), selfService: !!cfg.allow_self_service });
}));

// Non-admin users that a manager can assign domains to.
router.get('/assignable-users', manageAll, asyncHandler(async (_req, res) => {
  res.json(await queryAll(`SELECT id, username FROM panel_users WHERE role != 'admin' ORDER BY username`));
}));

// --- Render preview & global apply (managers only) ---
router.get('/preview', manageAll, asyncHandler(async (_req, res) => {
  res.json(await buildArtifacts());
}));

router.post('/apply', manageAll, asyncHandler(async (_req, res) => {
  res.json({ ok: true, output: await applyDns() });
}));

// --- Domains ---
router.get('/', asyncHandler(async (req, res) => {
  const countSel = '(SELECT COUNT(*) FROM dns_records r WHERE r.domain_id = d.id) AS record_count';
  if (canManageAll(req)) {
    res.json(await queryAll(`SELECT d.*, ${countSel} FROM domains d ORDER BY d.name`));
  } else {
    res.json(await queryAll(
      `SELECT d.*, ${countSel} FROM domains d
       JOIN domain_users du ON du.domain_id = d.id
       WHERE du.user_id = ? ORDER BY d.name`,
      [req.user!.userId],
    ));
  }
}));

router.post('/', asyncHandler(async (req, res) => {
  const d = parseBody(DomainSchema, req.body);
  const name = d.name.toLowerCase();
  if (await queryOne('SELECT 1 FROM domains WHERE name = ?', [name])) throw badRequest('Domain already exists');

  // Scoped users may only self-onboard a domain they've delegated to our NS.
  if (!canManageAll(req)) {
    const cfg = await getDnsConfig();
    if (!cfg.allow_self_service) throw forbidden('Self-service domain onboarding is disabled');
    const del = await checkDelegation(name);
    if (!del.delegated) {
      throw badRequest(
        `NS delegation not detected. Point ${name}'s nameservers to: ${del.configured.join(', ')}.` +
        (del.found.length ? ` Currently delegated to: ${del.found.join(', ')}.` : ' No NS records found yet.'),
      );
    }
  }

  const result = await execute(
    'INSERT INTO domains (name, ttl, primary_ns, admin_email) VALUES (?, ?, ?, ?)',
    [name, d.ttl, d.primary_ns, d.admin_email],
  );
  const id = Number(result.lastInsertRowid);
  if (!canManageAll(req)) {
    await execute('INSERT INTO domain_users (domain_id, user_id) VALUES (?, ?)', [id, req.user!.userId]);
  }
  res.status(201).json({ id });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  await execute('DELETE FROM domains WHERE id = ?', [intParam(req)]);
  res.json({ ok: true });
}));

// --- Domain assignments (managers only) ---
router.get('/:id/users', manageAll, asyncHandler(async (req, res) => {
  const rows = await queryAll<{ user_id: number }>('SELECT user_id FROM domain_users WHERE domain_id = ?', [intParam(req)]);
  res.json(rows.map(r => r.user_id));
}));

router.put('/:id/users', manageAll, asyncHandler(async (req, res) => {
  const domainId = intParam(req);
  if (!(await queryOne('SELECT 1 FROM domains WHERE id = ?', [domainId]))) throw notFound('Domain not found');
  const { userIds } = parseBody(AssignSchema, req.body);
  await execute('DELETE FROM domain_users WHERE domain_id = ?', [domainId]);
  for (const uid of userIds) {
    await execute('INSERT OR IGNORE INTO domain_users (domain_id, user_id) VALUES (?, ?)', [domainId, uid]);
  }
  res.json({ ok: true });
}));

// --- Records (scoped to domain ownership) ---
router.get('/:id/records', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  res.json(await queryAll('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [intParam(req)]));
}));

router.post('/:id/records', asyncHandler(async (req, res) => {
  const domainId = intParam(req);
  await assertDomainAccess(req, domainId);
  const r = parseBody(RecordSchema, req.body);
  const result = await execute(
    'INSERT INTO dns_records (domain_id, name, type, value, ttl, priority, weight, port) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [domainId, r.name, r.type, r.value, r.ttl ?? null, r.priority ?? null, r.weight ?? null, r.port ?? null],
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.put('/:id/records/:rid', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  const r = parseBody(RecordSchema.partial(), req.body);
  const { clause, values } = buildUpdate(r as Record<string, unknown>);
  await execute(`UPDATE dns_records SET ${clause} WHERE id = ? AND domain_id = ?`, [
    ...values, intParam(req, 'rid'), intParam(req),
  ]);
  res.json({ ok: true });
}));

router.delete('/:id/records/:rid', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  await execute('DELETE FROM dns_records WHERE id = ? AND domain_id = ?', [intParam(req, 'rid'), intParam(req)]);
  res.json({ ok: true });
}));

// --- Ownership verification (TXT challenge) ---
router.post('/:id/verify', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  const { method } = parseBody(VerifySchema, req.body);
  res.json(await startVerification(intParam(req), method));
}));

router.post('/:id/verify/check', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  res.json(await checkVerification(intParam(req)));
}));

// --- Per-domain apply (owners + managers) ---
router.post('/:id/apply', asyncHandler(async (req, res) => {
  await assertDomainAccess(req, intParam(req));
  res.json({ ok: true, output: await applyDomain(intParam(req)) });
}));

export default router;
