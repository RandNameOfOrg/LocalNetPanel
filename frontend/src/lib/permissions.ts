import { useAuthStore } from '../store/auth';

/**
 * Permission keys + human labels. Keep keys in sync with the backend
 * `backend/src/lib/permissions.ts`.
 */
export const PERMISSION_LABELS: Record<string, string> = {
  manage_devices: 'Manage devices & credentials',
  power: 'Power control (shutdown / reboot / wake)',
  terminal: 'SSH terminal',
  files: 'Files (browse & upload)',
  commands: 'Saved commands',
  cron: 'Cron jobs',
  manage_domains: 'Manage all domains & DNS settings',
  domains: 'Manage assigned domains only',
  manage_users: 'Manage panel users',
};

export const PERMISSIONS = Object.keys(PERMISSION_LABELS);

interface UserLike { role?: string; permissions?: string[] }

/** Admins implicitly hold every permission; 'manage_domains' implies 'domains'. */
export function can(user: UserLike | null | undefined, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions ?? [];
  if (perms.includes(perm)) return true;
  if (perm === 'domains' && perms.includes('manage_domains')) return true;
  return false;
}

/** Reactive permission check bound to the logged-in user. */
export function useCan(perm: string): boolean {
  const user = useAuthStore(s => s.user);
  return can(user, perm);
}
