import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../api/client';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { TextInput } from '../components/ui/inputs';
import DeviceSelect from '../components/DeviceSelect';
import CredentialSelect from '../components/CredentialSelect';
import { formatTimestamp } from '../lib/format';

interface CronJob {
  id: number; name: string; schedule: string; device_id: number; credential_id: number;
  command: string; enabled: number; last_run: number | null; last_status: string | null;
}

const emptyDraft = { name: '', schedule: '*/5 * * * *', device_id: '', credential_id: '', command: '' };

export default function CronPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [logs, setLogs] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState(emptyDraft);

  const { data: jobs = [] } = useQuery<CronJob[]>({ queryKey: ['cron'], queryFn: () => api.get('/cron').then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: () => api.post('/cron', {
      ...draft, device_id: Number(draft.device_id), credential_id: Number(draft.credential_id), enabled: true,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cron'] }); setShowAdd(false); setDraft(emptyDraft); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/cron/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => api.put(`/cron/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  });

  const viewLogs = async (id: number) => {
    const res = await api.get(`/cron/${id}/logs`);
    setLogs(prev => ({ ...prev, [id]: res.data.logs }));
  };

  const set = (k: keyof typeof draft, v: string) => setDraft(d => ({ ...d, [k]: v }));
  const canSave = draft.name && draft.command && draft.device_id && draft.credential_id;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Cron Jobs</h1>
        <Button onClick={() => setShowAdd(v => !v)}><Plus size={16} /> Add job</Button>
      </div>

      {showAdd && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><TextInput value={draft.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="Schedule (cron)"><TextInput className="font-mono" value={draft.schedule} onChange={e => set('schedule', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Device"><DeviceSelect value={draft.device_id} onChange={v => { set('device_id', v); set('credential_id', ''); }} /></Field>
            <Field label="Credential"><CredentialSelect deviceId={draft.device_id} value={draft.credential_id} onChange={v => set('credential_id', v)} /></Field>
          </div>
          <Field label="Command"><TextInput className="font-mono" value={draft.command} onChange={e => set('command', e.target.value)} /></Field>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={!canSave || addMutation.isPending}>
              {addMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map(job => (
          <div key={job.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <button onClick={() => toggleMutation.mutate({ id: job.id, enabled: !job.enabled })} className={job.enabled ? 'text-green-400' : 'text-gray-600'}>
                {job.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm">{job.name}</span>
                  <code className="text-xs bg-gray-800 text-blue-300 px-2 py-0.5 rounded font-mono">{job.schedule}</code>
                  {job.last_status && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${job.last_status === 'success' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {job.last_status}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-gray-500 truncate mt-0.5">{job.command}</div>
                <div className="text-xs text-gray-600 mt-0.5">Last run: {formatTimestamp(job.last_run)}</div>
              </div>
              <button onClick={() => viewLogs(job.id)} className="text-gray-500 hover:text-white" title="View logs"><FileText size={14} /></button>
              <button onClick={() => deleteMutation.mutate(job.id)} className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
            {logs[job.id] !== undefined && (
              <pre className="mt-3 bg-black rounded p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-40 overflow-auto border-t border-gray-800">
                {logs[job.id] || '(no logs yet)'}
              </pre>
            )}
          </div>
        ))}
        {jobs.length === 0 && <div className="text-sm text-gray-600 py-8 text-center">No cron jobs yet.</div>}
      </div>
    </div>
  );
}
