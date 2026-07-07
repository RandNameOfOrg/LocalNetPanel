import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Terminal, Power, RefreshCw, Zap, Info, FolderOpen,
  Plus, Trash2, ChevronLeft, User, Key,
} from 'lucide-react';
import { devicesApi } from '../api/devices';
import { useDevice } from '../hooks/useDevices';
import { useCredentials } from '../hooks/useCredentials';
import { useCan } from '../lib/permissions';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { TextInput } from '../components/ui/inputs';
import CredentialSelect from '../components/CredentialSelect';
import AddCredentialModal from '../components/AddCredentialModal';
import InfoPanel from '../components/InfoPanel';
import FilesBrowser from '../components/FilesBrowser';

type Tab = 'info' | 'files' | 'credentials';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'info', label: 'System Info', icon: Info },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'credentials', label: 'Credentials', icon: Key },
];

export default function DevicePage() {
  const { id } = useParams<{ id: string }>();
  const deviceId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('info');
  const [showAddCred, setShowAddCred] = useState(false);
  const [credId, setCredId] = useState('');
  const [powerDelay, setPowerDelay] = useState(0);

  const { data: device } = useDevice(deviceId);
  const { data: credentials = [] } = useCredentials(deviceId);
  const selectedCredId = credId ? Number(credId) : null;

  const canPower = useCan('power');
  const canTerminal = useCan('terminal');
  const canFiles = useCan('files');
  const canManageDevices = useCan('manage_devices');
  const tabs = TABS.filter(t =>
    t.id === 'info' || (t.id === 'files' && canFiles) || (t.id === 'credentials' && canManageDevices),
  );

  const powerMutation = useMutation({
    mutationFn: (action: string) =>
      devicesApi.power(deviceId, { action, credentialId: selectedCredId ?? undefined, delay: powerDelay }),
  });

  const deleteCred = useMutation({
    mutationFn: (id: number) => devicesApi.deleteCredential(deviceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device-creds', deviceId] }),
  });

  if (!device) return <div className="p-6 text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/devices')} className="text-gray-500 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white">{device.name}</h1>
          <div className="text-sm text-gray-500">{device.ip}:{device.port} · {device.os_type}</div>
        </div>
      </div>

      {/* Credential selector */}
      {credentials.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <User size={14} className="text-gray-500" />
          <div className="w-64">
            <CredentialSelect deviceId={deviceId} value={credId} onChange={setCredId} />
          </div>
        </div>
      )}

      {/* Power & terminal controls */}
      {(canPower || canTerminal) && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {canPower && (
            <>
              <Button size="sm" variant="danger" onClick={() => powerMutation.mutate('shutdown')} disabled={!selectedCredId}>
                <Power size={14} /> Shutdown
              </Button>
              <Button size="sm" variant="warning" onClick={() => powerMutation.mutate('reboot')} disabled={!selectedCredId}>
                <RefreshCw size={14} /> Reboot
              </Button>
              {device.mac && (
                <Button size="sm" variant="success" onClick={() => powerMutation.mutate('wake')}>
                  <Zap size={14} /> Wake-on-LAN
                </Button>
              )}
              <div className="flex items-center gap-2 ml-2">
                <label className="text-xs text-gray-500">Delay (s)</label>
                <div className="w-16">
                  <TextInput type="number" min={0} value={powerDelay} onChange={e => setPowerDelay(Number(e.target.value))} />
                </div>
              </div>
            </>
          )}
          {canTerminal && (
            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              disabled={!selectedCredId}
              onClick={() => navigate(`/devices/${deviceId}/terminal?credentialId=${selectedCredId}`)}
            >
              <Terminal size={14} /> SSH Terminal
            </Button>
          )}
        </div>
      )}

      {powerMutation.isSuccess && <div className="mb-4"><Alert kind="success">Command sent successfully</Alert></div>}
      {powerMutation.isError && <div className="mb-4"><Alert kind="error">{(powerMutation.error as Error).message}</Alert></div>}

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-5">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'info' && <InfoPanel deviceId={deviceId} credentialId={selectedCredId} />}
      {tab === 'files' && <FilesBrowser deviceId={deviceId} credentialId={selectedCredId} />}
      {tab === 'credentials' && (
        <div>
          <div className="flex justify-between mb-4">
            <span className="text-sm text-gray-400">{credentials.length} credential(s)</span>
            <button onClick={() => setShowAddCred(true)} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
              <Plus size={14} /> Add credential
            </button>
          </div>
          <div className="space-y-2">
            {credentials.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white">{c.label}</div>
                  <div className="text-xs text-gray-500">{c.username} · {c.auth_type}</div>
                </div>
                <button onClick={() => deleteCred.mutate(c.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddCred && <AddCredentialModal deviceId={deviceId} onClose={() => setShowAddCred(false)} />}
    </div>
  );
}
