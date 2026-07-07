import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { execute } from '../db/db';
import { nowSeconds } from '../lib/sql';
import { parsePermissions } from '../lib/permissions';

const ACCESS_TTL = '15m';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_COOKIE = 'refreshToken';

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  permissions: string[];
}

/** A panel_users row as stored (permissions is a JSON string column). */
export interface UserRow {
  id: number;
  username: string;
  role: string;
  permissions: string | null;
}

/** Convert a DB row into an AuthUser with parsed permissions. */
export const toAuthUser = (row: UserRow): AuthUser => ({
  id: row.id,
  username: row.username,
  role: row.role,
  permissions: parsePermissions(row.permissions),
});

export const getRefreshCookie = (req: { cookies?: Record<string, string> }): string | undefined =>
  req.cookies?.[REFRESH_COOKIE];

/** Strip the password hash before returning a user to the client. */
export const publicUser = (u: AuthUser) => ({
  id: u.id, username: u.username, role: u.role, permissions: u.permissions,
});

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role, permissions: user.permissions },
    process.env.JWT_SECRET ?? '',
    { expiresIn: ACCESS_TTL },
  );
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: REFRESH_TTL_SECONDS * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Issue a fresh refresh token (revoking `oldToken` if given), persist it,
 * set the httpOnly cookie, and return a new access token. Shared by the
 * login and refresh routes.
 */
export async function rotateRefreshToken(res: Response, user: AuthUser, oldToken?: string): Promise<string> {
  if (oldToken) await execute('DELETE FROM refresh_tokens WHERE token = ?', [oldToken]);

  const token = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET ?? '', { expiresIn: '7d' });
  await execute(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, token, nowSeconds() + REFRESH_TTL_SECONDS],
  );
  setRefreshCookie(res, token);
  return signAccessToken(user);
}

/** Revoke a refresh token and clear its cookie (logout). */
export async function revokeRefreshToken(res: Response, token: string | undefined): Promise<void> {
  if (token) await execute('DELETE FROM refresh_tokens WHERE token = ?', [token]);
  res.clearCookie(REFRESH_COOKIE);
}
