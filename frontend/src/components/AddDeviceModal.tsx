import { useState, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Radar } from 'lucide-react';
import { devicesApi, discoverHosts, DiscoveredHost } from '../api/devices';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Button from './ui/Button';
import Alert from './ui/Alert';
import { TextInput, Select } from './ui/inputs';

export default function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', ip: '', mac: '', os_type: 'linux' as 'linux' | 'windows', port: 22, notes: '',
  });

  const mutation = useMutation({
    mutationFn: () => devicesApi.create({ ...form, mac: form.mac.trim() || null, notes: form.notes || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); },
  });

  const scan = useMutation<DiscoveredHost[]>({ mutationFn: discoverHosts });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const pickHost = (h: DiscoveredHost) => setForm(f => ({ ...f, ip: h.ip, mac: h.mac, name: f.name || h.ip }));

  // MAC is optional, but validate the format when a value is present (mirrors the backend).
  const MAC_RE = /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/;
  const macError = form.mac.trim() && !MAC_RE.test(form.mac.trim()) ? 'Use format AA:BB:CC:DD:EE:FF' : '';

  return (
    <Modal title="Add Device" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <Field label="Name">
          <TextInput value={form.name} onChange={e => set('name', e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IP Address">
            <TextInput value={form.ip} onChange={e => set('ip', e.target.value)} required />
          </Field>
          <Field label="SSH Port">
            <TextInput type="number" value={form.port} onChange={e => set('port', Number(e.target.value))} />
          </Field>
        </div>
        <Field label="MAC Address (optional, for WoL)">
          <TextInput value={form.mac} onChange={e => set('mac', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
          {macError && <p className="text-xs text-red-400 mt-1">{macError}</p>}
        </Field>

        {/* Network auto-discovery */}
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Find devices on the local network</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
              <Radar size={13} /> {scan.isPending ? 'Scanning…' : 'Scan network'}
            </Button>
          </div>
          {scan.isError && <div className="mt-2"><Alert kind="error">{(scan.error as Error).message}</Alert></div>}
          {scan.data && (
            <div className="mt-2 max-h-40 overflow-auto rounded border border-gray-800 divide-y divide-gray-800">
              {scan.data.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No hosts found.</div>}
              {scan.data.map(h => (
                <button
                  key={h.mac}
                  type="button"
                  onClick={() => pickHost(h)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-gray-800"
                >
                  <span className="font-mono text-gray-200">{h.ip}</span>
                  <span className="font-mono text-gray-500">{h.mac}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="OS Type">
          <Select value={form.os_type} onChange={e => set('os_type', e.target.value)}>
            <option value="linux">Linux</option>
            <option value="windows">Windows</option>
          </Select>
        </Field>
        <Field label="Notes">
          <TextInput value={form.notes} onChange={e => set('notes', e.target.value)} />
        </Field>

        {mutation.isError && (
          <Alert kind="error">
            {(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (mutation.error as Error).message}
          </Alert>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending || !!macError}>{mutation.isPending ? 'Adding…' : 'Add Device'}</Button>
        </div>
      </form>
    </Modal>
  );
}
