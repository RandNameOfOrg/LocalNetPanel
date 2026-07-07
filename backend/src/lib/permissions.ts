/**
 * Panel permission keys. A non-admin user holds a subset of these; an admin
 * implicitly holds all of them. Keep this list in sync with the frontend copy
 * in `frontend/src/lib/permissions.ts`.
 */
export const PERMISSIONS = [
  'manage_devices', // create / edit / delete devices and their SSH credentials
  'power',          // shutdown / reboot / wake
  'terminal',       // open the SSH terminal
  'files',          // browse, read, and upload files
  'commands',       // create / delete / run saved commands
  'cron',           // create / edit / delete cron jobs
  'manage_domains', // manage ALL domains + DNS records (BIND) and DNS settings
  'domains',        // manage only the domains assigned to the user (or self-onboarded)
  'manage_users',   // administer panel users and their permissions
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value);

/** Admins always pass; everyone else must hold the permission explicitly. */
export function userHasPermission(
  user: { role?: string; permissions?: string[] } | undefined,
  perm: Permission,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions ?? [];
  if (perms.includes(perm)) return true;
  // Holding 'manage_domains' (all domains) implies the scoped 'domains' permission.
  if (perm === 'domains' && perms.includes('manage_domains')) return true;
  return false;
}

/** Parse the JSON `permissions` column into a clean string[] (never throws). */
export function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPermission) : [];
  } catch {
    return [];
  }
}
