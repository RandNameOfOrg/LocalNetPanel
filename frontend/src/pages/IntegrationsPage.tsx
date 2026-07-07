import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { adguardApi } from '../api/adguard';
import Alert from '../components/ui/Alert';

export default function IntegrationsPage() {
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-white mb-1">Integrations</h1>
      <p className="text-sm text-gray-500 mb-6">
        External services the panel can read from. Configure them in <code className="text-gray-400">backend/.env</code>.
      </p>
      <AdguardCard />
    </div>
  );
}

function AdguardCard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['adguard'], queryFn: adguardApi.status });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-blue-400" />
        <h2 className="text-sm font-medium text-gray-200">AdGuard Home</h2>
        <span className="text-xs text-gray-600">read-only</span>
      </div>
      {isLoading && <div className="text-sm text-gray-500">Loading…</div>}
      {error && <Alert kind="error">{(error as Error).message}</Alert>}
      {data && !data.configured && (
        <div className="text-sm text-gray-500">
          Not configured. Set <code className="text-gray-400">ADGUARD_URL</code> in <code className="text-gray-400">backend/.env</code> to enable.
        </div>
      )}
      {data?.configured && data.reachable === false && <Alert kind="error">Unreachable: {data.error}</Alert>}
      {data?.configured && data.reachable && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Protection" value={data.status?.protection_enabled ? 'On' : 'Off'} good={data.status?.protection_enabled} />
          <Stat label="Running" value={data.status?.running ? 'Yes' : 'No'} good={data.status?.running} />
          <Stat label="Version" value={data.status?.version ?? '—'} />
          <Stat label="DNS queries" value={(data.stats?.num_dns_queries ?? 0).toLocaleString()} />
          <Stat label="Blocked" value={(data.stats?.num_blocked_filtering ?? 0).toLocaleString()} />
          <Stat label="Listen" value={(data.status?.dns_addresses ?? []).join(', ') || '—'} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="bg-gray-950/50 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-medium ${good === undefined ? 'text-white' : good ? 'text-green-400' : 'text-red-400'}`}>{value}</div>
    </div>
  );
}
