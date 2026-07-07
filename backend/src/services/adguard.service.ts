/**
 * Optional, read-only AdGuardHome integration. Enabled only when ADGUARD_URL is
 * set; otherwise every call reports `configured: false` and does nothing.
 *
 * Env: ADGUARD_URL, ADGUARD_USERNAME, ADGUARD_PASSWORD (basic auth).
 */

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.ADGUARD_USERNAME) {
    const creds = `${process.env.ADGUARD_USERNAME}:${process.env.ADGUARD_PASSWORD ?? ''}`;
    headers.Authorization = `Basic ${Buffer.from(creds).toString('base64')}`;
  }
  return headers;
}

async function getJson<T>(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AdguardStatus {
  configured: boolean;
  reachable?: boolean;
  error?: string;
  status?: { protection_enabled?: boolean; running?: boolean; version?: string; dns_addresses?: string[] };
  stats?: { num_dns_queries?: number; num_blocked_filtering?: number };
}

/** Fetch AdGuardHome status + stats (read-only). Never throws — failures are reported in the result. */
export async function getAdguardStatus(): Promise<AdguardStatus> {
  const base = process.env.ADGUARD_URL?.replace(/\/$/, '');
  if (!base) return { configured: false };

  const headers = authHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const [status, stats] = await Promise.all([
      getJson<AdguardStatus['status']>(`${base}/control/status`, headers, controller.signal),
      getJson<AdguardStatus['stats']>(`${base}/control/stats`, headers, controller.signal),
    ]);
    return { configured: true, reachable: true, status, stats };
  } catch (err: unknown) {
    return { configured: true, reachable: false, error: err instanceof Error ? err.message : 'Request failed' };
  } finally {
    clearTimeout(timer);
  }
}
