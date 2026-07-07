import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Permission, userHasPermission } from '../lib/permissions';

export interface AuthPayload {
  userId: number;
  username: string;
  role: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? '') as AuthPayload;
    req.user = { ...payload, permissions: payload.permissions ?? [] };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

/** Allow the request only if the user is an admin or holds `perm`. */
export function requirePermission(perm: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (userHasPermission(req.user, perm)) {
      next();
      return;
    }
    res.status(403).json({ error: `Forbidden: missing '${perm}' permission` });
  };
}
