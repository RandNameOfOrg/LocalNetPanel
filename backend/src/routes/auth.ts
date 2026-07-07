import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryOne, execute } from '../db/db';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler, parseBody } from '../lib/http';
import { unauthorized } from '../lib/errors';
import {
  UserRow, toAuthUser, publicUser, getRefreshCookie,
  rotateRefreshToken, revokeRefreshToken,
} from '../services/auth.service';
import { nowSeconds } from '../lib/sql';

const router = Router();

const CredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

interface PanelUserRow extends UserRow { password: string; }

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = parseBody(CredentialsSchema, req.body);
  const row = await queryOne<PanelUserRow>('SELECT * FROM panel_users WHERE username = ?', [username]);
  if (!row || !bcrypt.compareSync(password, row.password)) throw unauthorized('Invalid credentials');

  const user = toAuthUser(row);
  const accessToken = await rotateRefreshToken(res, user);
  res.json({ accessToken, user: publicUser(user) });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (!token) throw unauthorized('No refresh token');

  let payload: { userId: number };
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET ?? '') as { userId: number };
  } catch {
    throw unauthorized('Invalid refresh token');
  }

  const stored = await queryOne<{ expires_at: number }>('SELECT expires_at FROM refresh_tokens WHERE token = ?', [token]);
  if (!stored || stored.expires_at < nowSeconds()) throw unauthorized('Refresh token expired or revoked');

  const row = await queryOne<UserRow>('SELECT id, username, role, permissions FROM panel_users WHERE id = ?', [payload.userId]);
  if (!row) throw unauthorized('User not found');

  res.json({ accessToken: await rotateRefreshToken(res, toAuthUser(row), token) });
}));

router.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  await revokeRefreshToken(res, getRefreshCookie(req));
  res.json({ ok: true });
}));

// Initial admin setup — only works while no users exist.
router.post('/setup', asyncHandler(async (req, res) => {
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*) as n FROM panel_users');
  if ((existing?.n ?? 0) > 0) { res.status(403).json({ error: 'Setup already done' }); return; }

  const { username, password } = parseBody(CredentialsSchema, req.body);
  await execute('INSERT INTO panel_users (username, password, role) VALUES (?, ?, ?)', [
    username, bcrypt.hashSync(password, 12), 'admin',
  ]);
  res.json({ ok: true });
}));

export default router;
