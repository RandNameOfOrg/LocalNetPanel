import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../api/devices';

const INFO_TYPES = ['basic', 'cpu', 'ram', 'gpu', 'disk', 'processes', 'docker', 'network'] as const;

export default function InfoPanel({ deviceId, credentialId }: { deviceId: number; credentialId: number | null }) {
  const [type, setType] = useState<string>('basic');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['device-info', deviceId, credentialId, type],
    queryFn: () => devicesApi.info(deviceId, credentialId!, type),
    enabled: !!credentialId,
  });

  if (!credentialId) {
    return <div className="text-sm text-gray-500">Select a credential to view system info.</div>;
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-4">
        {INFO_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              type === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => refetch()}
          className="px-3 py-1 rounded-md text-xs bg-gray-800 text-gray-400 hover:text-white ml-auto"
        >
          Refresh
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 min-h-32">
        {isLoading && <div className="text-sm text-gray-500">Loading…</div>}
        {error && <div className="text-sm text-red-400">{(error as Error).message}</div>}
        {data && (
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
            {data.output}
          </pre>
        )}
      </div>
    </div>
  );
}
