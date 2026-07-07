import { Router } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, execute } from '../db/db';
import { encrypt } from '../services/crypto.service';
import { requirePermission } from '../middleware/auth.middleware';
import { asyncHandler, parseBody, intParam } from '../lib/http';
import { buildUpdate } from '../lib/sql';
import { notFound } from '../lib/errors';
import { isValidMac } from '../lib/net';

const router = Router();

const DeviceSchema = z.object({
  name: z.string().min(1),
  ip: z.string().min(1),
  mac: z.string().nullish().refine(v => v == null || v === '' || isValidMac(v), 'Invalid MAC address'),
  os_type: z.enum(['linux', 'windows']).default('linux'),
  port: z.number().int().min(1).max(65535).default(22),
  notes: z.string().nullish(),
});

const CredentialSchema = z.object({
  label: z.string().min(1),
  username: z.string().min(1),
  auth_type: z.enum(['password', 'key']),
  secret: z.string().optional(),
  passphrase: z.string().optional(),
});

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await queryAll('SELECT * FROM devices ORDER BY name'));
}));

router.post('/', requirePermission('manage_devices'), asyncHandler(async (req, res) => {
  const d = parseBody(DeviceSchema, req.body);
  const result = await execute(
    'INSERT INTO devices (name, ip, mac, os_type, port, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [d.name, d.ip, d.mac ?? null, d.os_type, d.port, d.notes ?? null],
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const device = await queryOne('SELECT * FROM devices WHERE id = ?', [intParam(req)]);
  if (!device) throw notFound();
  res.json(device);
}));

router.put('/:id', requirePermission('manage_devices'), asyncHandler(async (req, res) => {
  const d = parseBody(DeviceSchema.partial(), req.body);
  const { clause, values } = buildUpdate(d);
  await execute(`UPDATE devices SET ${clause}, updated_at = unixepoch() WHERE id = ?`, [...values, intParam(req)]);
  res.json({ ok: true });
}));

router.delete('/:id', requirePermission('manage_devices'), asyncHandler(async (req, res) => {
  await execute('DELETE FROM devices WHERE id = ?', [intParam(req)]);
  res.json({ ok: true });
}));

// --- Credentials (nested under a device) ---

router.get('/:id/credentials', asyncHandler(async (req, res) => {
  res.json(await queryAll(
    'SELECT id, device_id, label, username, auth_type, created_at FROM device_credentials WHERE device_id = ?',
    [intParam(req)],
  ));
}));

router.post('/:id/credentials', requirePermission('manage_devices'), asyncHandler(async (req, res) => {
  const c = parseBody(CredentialSchema, req.body);
  const result = await execute(
    'INSERT INTO device_credentials (device_id, label, username, auth_type, secret, passphrase) VALUES (?, ?, ?, ?, ?, ?)',
    [
      intParam(req), c.label, c.username, c.auth_type,
      c.secret ? encrypt(c.secret) : null,
      c.passphrase ? encrypt(c.passphrase) : null,
    ],
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.delete('/:id/credentials/:credId', requirePermission('manage_devices'), asyncHandler(async (req, res) => {
  await execute('DELETE FROM device_credentials WHERE id = ? AND device_id = ?', [
    intParam(req, 'credId'), intParam(req),
  ]);
  res.json({ ok: true });
}));

export default router;
