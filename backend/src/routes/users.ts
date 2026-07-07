import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne, queryAll, execute } from '../db/db';
import { asyncHandler, parseBody, intParam } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';
import { buildUpdate } from '../lib/sql';
import { PERMISSIONS, isPermission, parsePermissions } from '../lib/permissions';

const router = Router();

const CreateSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).default('user'),
  permissions: z.array(z.string()).default([]),
});

const UpdateSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'user']).optional(),
  permissions: z.array(z.string()).optional(),
});

interface UserRow { id: number; username: string; role: string; permissions: string | null; created_at: number; }

const toPublic = (u: UserRow) => ({
  id: u.id, username: u.username, role: u.role,
  permissions: parsePermissions(u.permissions), created_at: u.created_at,
});

async function adminCount(): Promise<number> {
  const r = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM panel_users WHERE role = 'admin'");
  return r?.n ?? 0;
}

// Expose the permission catalogue so the UI can render checkboxes.
router.get('/permissions', (_req, res) => res.json(PERMISSIONS));

router.get('/', asyncHandler(async (_req, res) => {
  const rows = await queryAll<UserRow>('SELECT id, username, role, permissions, created_at FROM panel_users ORDER BY username');
  res.json(rows.map(toPublic));
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = parseBody(CreateSchema, req.body);
  const exists = await queryOne('SELECT 1 FROM panel_users WHERE username = ?', [data.username]);
  if (exists) throw badRequest('Username already taken');

  const permissions = JSON.stringify(data.permissions.filter(isPermission));
  const result = await execute(
    'INSERT INTO panel_users (username, password, role, permissions) VALUES (?, ?, ?, ?)',
    [data.username, bcrypt.hashSync(data.password, 12), data.role, permissions],
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = intParam(req);
  const data = parseBody(UpdateSchema, req.body);

  const target = await queryOne<UserRow>('SELECT id, role FROM panel_users WHERE id = ?', [id]);
  if (!target) throw notFound('User not found');

  // Don't allow demoting the last remaining admin (would lock everyone out).
  if (data.role === 'user' && target.role === 'admin' && (await adminCount()) <= 1) {
    throw badRequest('Cannot demote the last admin');
  }

  const patch: Record<string, unknown> = {};
  if (data.username !== undefined) patch.username = data.username;
  if (data.password !== undefined) patch.password = bcrypt.hashSync(data.password, 12);
  if (data.role !== undefined) patch.role = data.role;
  if (data.permissions !== undefined) patch.permissions = JSON.stringify(data.permissions.filter(isPermission));

  const { clause, values } = buildUpdate(patch);
  await execute(`UPDATE panel_users SET ${clause} WHERE id = ?`, [...values, id]);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = intParam(req);
  if (req.user?.userId === id) throw badRequest('You cannot delete your own account');

  const target = await queryOne<UserRow>('SELECT id, role FROM panel_users WHERE id = ?', [id]);
  if (!target) throw notFound('User not found');
  if (target.role === 'admin' && (await adminCount()) <= 1) throw badRequest('Cannot delete the last admin');

  await execute('DELETE FROM panel_users WHERE id = ?', [id]);
  res.json({ ok: true });
}));

export default router;
