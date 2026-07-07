import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import Button from '../components/ui/Button';
import { TextInput } from '../components/ui/inputs';
import DeviceSelect from '../components/DeviceSelect';
import CredentialSelect from '../components/CredentialSelect';

interface Command { id: number; name: string; command: string; description: string | null; }

export default function CommandsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: '', command: '', description: '' });

  const { data: commands = [] } = useQuery<Command[]>({ queryKey: ['commands'], queryFn: () => api.get('/commands').then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: () => api.post('/commands', draft),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['commands'] }); setShowAdd(false); setDraft({ name: '', command: '', description: '' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/commands/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commands'] }),
  });

  const setDraftField = (k: keyof typeof draft, v: string) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Saved Commands</h1>
        <Button onClick={() => setShowAdd(v => !v)}><Plus size={16} /> Add command</Button>
      </div>

      {showAdd && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5 space-y-3">
          <TextInput placeholder="Name" value={draft.name} onChange={e => setDraftField('name', e.target.value)} />
          <TextInput className="font-mono" placeholder="Command (e.g. docker ps)" value={draft.command} onChange={e => setDraftField('command', e.target.value)} />
          <TextInput placeholder="Description (optional)" value={draft.description} onChange={e => setDraftField('description', e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={!draft.name || !draft.command || addMutation.isPending}>
              {addMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {commands.map(cmd => (
          <CommandRow key={cmd.id} cmd={cmd} onDelete={() => deleteMutation.mutate(cmd.id)} />
        ))}
        {commands.length === 0 && <div className="text-sm text-gray-600 py-8 text-center">No saved commands yet.</div>}
      </div>
    </div>
  );
}

function CommandRow({ cmd, onDelete }: { cmd: Command; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [credId, setCredId] = useState('');
  const [output, setOutput] = useState<string>();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!deviceId || !credId) return;
    setLoading(true);
    setOutput(undefined);
    try {
      const res = await api.post(`/commands/${cmd.id}/run`, { deviceId: Number(deviceId), credentialId: Number(credId) });
      setOutput(res.data.output);
    } catch (e: unknown) {
      setOutput(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white text-sm">{cmd.name}</div>
          <div className="text-xs font-mono text-gray-500 truncate">{cmd.command}</div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-white">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button onClick={onDelete} className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          {cmd.description && <p className="text-xs text-gray-500">{cmd.description}</p>}
          <div className="flex gap-2 items-center">
            <div className="flex-1 min-w-[8rem]"><DeviceSelect value={deviceId} onChange={v => { setDeviceId(v); setCredId(''); }} /></div>
            <div className="flex-1 min-w-[8rem]"><CredentialSelect deviceId={deviceId} value={credId} onChange={setCredId} /></div>
            <Button size="sm" variant="success" onClick={run} disabled={!deviceId || !credId || loading}>
              <Play size={13} /> {loading ? 'Running…' : 'Run'}
            </Button>
          </div>
          {output !== undefined && (
            <pre className="bg-black rounded p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-40 overflow-auto">
              {output || '(empty output)'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
