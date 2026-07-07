import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Monitor, Server, Wifi, Trash2, Settings } from 'lucide-react';
import { Device } from '../api/devices';
import { useDevices } from '../hooks/useDevices';
import { devicesApi } from '../api/devices';
import { useCan } from '../lib/permissions';
import Button from '../components/ui/Button';
import AddDeviceModal from '../components/AddDeviceModal';

export default function Dashboard() {
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canManage = useCan('manage_devices');

  const { data: devices = [], isLoading } = useDevices();

  const deleteMutation = useMutation({
    mutationFn: devicesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Delete this device?')) deleteMutation.mutate(id);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Devices</h1>
        {canManage && <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add device</Button>}
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <Monitor size={40} className="mx-auto mb-3 opacity-40" />
          <p>No devices yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              canManage={canManage}
              onClick={() => navigate(`/devices/${device.id}`)}
              onDelete={e => handleDelete(e, device.id)}
            />
          ))}
        </div>
      )}

      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function DeviceCard({
  device,
  canManage,
  onClick,
  onDelete,
}: {
  device: Device;
  canManage: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const isLinux = device.os_type === 'linux';

  return (
    <div
      onClick={onClick}
      className="bg-gray-900 border border-gray-800 rounded-xl p-5 cursor-pointer hover:border-gray-600 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Server size={18} className={isLinux ? 'text-orange-400' : 'text-blue-400'} />
          </div>
          <div>
            <div className="font-medium text-white">{device.name}</div>
            <div className="text-xs text-gray-500">{isLinux ? 'Linux' : 'Windows'}</div>
          </div>
        </div>
        {canManage && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Wifi size={13} className="text-green-400" />
          {device.ip}:{device.port}
        </div>
        {device.mac && <div className="text-xs text-gray-600 font-mono">{device.mac}</div>}
        {device.notes && <div className="text-xs text-gray-600 mt-2 truncate">{device.notes}</div>}
      </div>

      <div className="mt-3 flex items-center gap-1">
        <Settings size={11} className="text-gray-700" />
        <span className="text-xs text-gray-700">Click to manage</span>
      </div>
    </div>
  );
}
