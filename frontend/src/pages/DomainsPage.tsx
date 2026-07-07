import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, Settings, Eye, UploadCloud, ChevronDown, ChevronUp, ShieldCheck, Users } from 'lucide-react';
import { domainsApi, Domain, DnsRecord, DnsConfig, VerifyChallenge, RECORD_TYPES } from '../api/domains';
import { useCan } from '../lib/permissions';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';
import { TextInput, Select, Textarea } from '../components/ui/inputs';
import DeviceSelect from '../components/DeviceSelect';
import CredentialSelect from '../components/CredentialSelect';

export default function DomainsPage() {
  const qc = useQueryClient();
  const canManageAll = useCan('manage_domains');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: domainsApi.list });
  const apply = useMutation({ mutationFn: domainsApi.apply });

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-white">Domains</h1>
        <div className="flex flex-wrap gap-2">
          {canManageAll && <Button variant="secondary" size="sm" onClick={() => setShowSettings(v => !v)}><Settings size={14} /> DNS settings</Button>}
          {canManageAll && <Button variant="secondary" size="sm" onClick={() => setShowPreview(v => !v)}><Eye size={14} /> Preview</Button>}
          {canManageAll && (
            <Button variant="success" size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
              <UploadCloud size={14} /> {apply.isPending ? 'Applying…' : 'Apply to BIND'}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add domain</Button>
        </div>
      </div>

      {apply.isSuccess && <div className="mb-4"><Alert kind="success">Applied. {apply.data.output || 'BIND reloaded.'}</Alert></div>}
      {apply.isError && (
        <div className="mb-4">
          <Alert kind="error">
            {(apply.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (apply.error as Error).message}
          </Alert>
        </div>
      )}

      {showSettings && canManageAll && <DnsSettingsPanel />}
      {showPreview && canManageAll && <PreviewPanel />}

      <div className="space-y-3">
        {domains.map(d => <DomainRow key={d.id} domain={d} canManageAll={canManageAll} />)}
        {domains.length === 0 && <div className="text-sm text-gray-600 py-8 text-center">No domains yet.</div>}
      </div>

      {showAdd && <AddDomainModal canManageAll={canManageAll} onClose={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['domains'] }); qc.invalidateQueries({ queryKey: ['dns-preview'] }); }} />}
    </div>
  );
}

function DnsSettingsPanel() {
  const qc = useQueryClient();
  const { data: config } = useQuery({ queryKey: ['dns-config'], queryFn: domainsApi.getConfig });
  const [form, setForm] = useState<Partial<DnsConfig>>({});
  useEffect(() => { if (config) setForm(config); }, [config]);

  const save = useMutation({
    mutationFn: () => domainsApi.updateConfig({
      device_id: form.device_id ? Number(form.device_id) : null,
      credential_id: form.credential_id ? Number(form.credential_id) : null,
      include_path: form.include_path,
      zones_dir: form.zones_dir,
      reload_hook: form.reload_hook,
      nameservers: form.nameservers ?? '',
      allow_self_service: form.allow_self_service ? 1 : 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dns-config'] }); qc.invalidateQueries({ queryKey: ['dns-preview'] }); },
  });

  const set = (k: keyof DnsConfig, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5 space-y-3">
      <h2 className="text-sm font-medium text-gray-300">DNS server (BIND)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="DNS server device">
          <DeviceSelect value={form.device_id ? String(form.device_id) : ''} onChange={v => { set('device_id', v || null); set('credential_id', null); }} />
        </Field>
        <Field label="SSH credential">
          <CredentialSelect deviceId={form.device_id ?? null} value={form.credential_id ? String(form.credential_id) : ''} onChange={v => set('credential_id', v || null)} />
        </Field>
      </div>
      <Field label="Include file path (added to named.conf)">
        <TextInput className="font-mono" value={form.include_path ?? ''} onChange={e => set('include_path', e.target.value)} />
      </Field>
      <Field label="Authoritative nameservers (one per line)">
        <Textarea
          className="font-mono"
          rows={2}
          placeholder={'ns1.example.com\nns2.example.com'}
          value={form.nameservers ?? ''}
          onChange={e => set('nameservers', e.target.value)}
        />
        <p className="text-xs text-gray-600 mt-1">
          Applied to every zone's apex NS records (first is the SOA primary). A bare label is treated as
          relative to each domain; include a dot for an external FQDN. Leave blank to use each domain's own primary NS.
        </p>
      </Field>
      <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="accent-blue-600 mt-0.5"
          checked={!!form.allow_self_service}
          onChange={e => set('allow_self_service', e.target.checked ? 1 : 0)}
        />
        <span>
          Allow self-service onboarding
          <span className="block text-xs text-gray-600">
            Users with the “Manage assigned domains only” permission can add a domain once they delegate its
            nameservers (at their registrar) to the ones configured above. Verified via public DNS on submit.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Zones directory">
          <TextInput className="font-mono" value={form.zones_dir ?? ''} onChange={e => set('zones_dir', e.target.value)} />
        </Field>
        <Field label="Post-apply hook">
          <TextInput className="font-mono" value={form.reload_hook ?? ''} onChange={e => set('reload_hook', e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-gray-600">The SSH user must be able to write these paths; the hook handles the privileged reload.</span>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</Button>
      </div>
      {save.isSuccess && <Alert kind="success">Settings saved.</Alert>}
    </div>
  );
}

function PreviewPanel() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dns-preview'], queryFn: domainsApi.preview });
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
      <h2 className="text-sm font-medium text-gray-300 mb-3">Rendered BIND config (preview)</h2>
      {isLoading && <div className="text-sm text-gray-500">Loading…</div>}
      {error && <Alert kind="error">{(error as Error).message}</Alert>}
      {data && (
        <div className="space-y-3">
          <PreviewBlock title={data.includePath} content={data.includeContent} />
          {data.zones.map(z => <PreviewBlock key={z.path} title={z.path} content={z.content} />)}
          {data.zones.length === 0 && <div className="text-xs text-gray-600">No zones to render.</div>}
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 font-mono mb-1">{title}</div>
      <pre className="bg-black rounded p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-auto max-h-60">{content}</pre>
    </div>
  );
}

function DomainRow({ domain, canManageAll }: { domain: Domain; canManageAll: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['records', domain.id], queryFn: () => domainsApi.listRecords(domain.id), enabled: open,
  });
  const removeDomain = useMutation({
    mutationFn: () => domainsApi.remove(domain.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); qc.invalidateQueries({ queryKey: ['dns-preview'] }); },
  });
  const deleteRecord = useMutation({
    mutationFn: (rid: number) => domainsApi.deleteRecord(domain.id, rid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', domain.id] });
      qc.invalidateQueries({ queryKey: ['domains'] });
      qc.invalidateQueries({ queryKey: ['dns-preview'] });
    },
  });
  const applyOne = useMutation({ mutationFn: () => domainsApi.applyDomain(domain.id) });
  const applyErr = (applyOne.error as { response?: { data?: { error?: string } } })?.response?.data?.error
    ?? (applyOne.error as Error | undefined)?.message;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <Globe size={16} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{domain.name}</span>
            {domain.verified
              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900 text-green-300 inline-flex items-center gap-1"><ShieldCheck size={10} /> verified</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">unverified</span>}
          </div>
          <div className="text-xs text-gray-500">{domain.record_count} record(s) · TTL {domain.ttl}</div>
        </div>
        {canManageAll && (
          <button onClick={() => setShowAssign(v => !v)} title="Assign users" className="text-gray-500 hover:text-blue-400"><Users size={15} /></button>
        )}
        <button
          onClick={() => applyOne.mutate()}
          disabled={applyOne.isPending}
          title="Apply this domain to BIND"
          className="text-gray-500 hover:text-green-400 disabled:opacity-50"
        >
          <UploadCloud size={15} />
        </button>
        <button onClick={() => setOpen(v => !v)} className="text-gray-500 hover:text-white">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
        <button onClick={() => { if (confirm(`Delete domain ${domain.name} and all its records?`)) removeDomain.mutate(); }} className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
      </div>

      {(applyOne.isSuccess || applyOne.isError) && (
        <div className="px-4 pb-3">
          {applyOne.isSuccess
            ? <Alert kind="success">Applied. {applyOne.data.output || 'BIND reloaded.'}</Alert>
            : <Alert kind="error">{applyErr}</Alert>}
        </div>
      )}

      {canManageAll && showAssign && <div className="px-4 pb-3"><AssignPanel domainId={domain.id} /></div>}

      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-2">
          {records.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-xs font-mono bg-gray-950/50 rounded px-3 py-1.5">
              <span className="text-gray-300 w-32 truncate">{r.name}</span>
              <span className="text-blue-300 w-14">{r.type}</span>
              <span className="text-gray-400 flex-1 truncate">{recordRdata(r)}</span>
              <button onClick={() => deleteRecord.mutate(r.id)} className="text-gray-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
          {records.length === 0 && <div className="text-xs text-gray-600">No records.</div>}
          <AddRecordForm domainId={domain.id} />
          <VerifySection domain={domain} />
        </div>
      )}
    </div>
  );
}

function AssignPanel({ domainId }: { domainId: number }) {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['assignable-users'], queryFn: domainsApi.assignableUsers });
  const assignedQuery = useQuery({ queryKey: ['domain-users', domainId], queryFn: () => domainsApi.getDomainUsers(domainId) });
  const assigned = assignedQuery.data ?? [];

  const [sel, setSel] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (!loaded && assignedQuery.isSuccess) { setSel(assigned); setLoaded(true); } }, [loaded, assignedQuery.isSuccess, assigned]);

  const toggle = (id: number) => setSel(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const save = useMutation({
    mutationFn: () => domainsApi.setDomainUsers(domainId, sel),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domain-users', domainId] }); qc.invalidateQueries({ queryKey: ['domains'] }); },
  });

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-2">
      <div className="text-xs text-gray-400">Assign users (grants the scoped “domains” permission for this domain)</div>
      {users.length === 0 ? (
        <div className="text-xs text-gray-600">No non-admin users to assign. Create users on the Users page.</div>
      ) : (
        <div className="space-y-1.5">
          {users.map(u => (
            <label key={u.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" className="accent-blue-600" checked={sel.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.username}
            </label>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || users.length === 0}>{save.isPending ? 'Saving…' : 'Save assignments'}</Button>
      </div>
      {save.isSuccess && <Alert kind="success">Assignments saved.</Alert>}
    </div>
  );
}

function VerifySection({ domain }: { domain: Domain }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<'bind' | 'external'>((domain.verify_method as 'bind' | 'external') || 'bind');
  const [challenge, setChallenge] = useState<VerifyChallenge | null>(null);

  const start = useMutation({ mutationFn: () => domainsApi.startVerify(domain.id, method), onSuccess: c => setChallenge(c) });
  const check = useMutation({ mutationFn: () => domainsApi.checkVerify(domain.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }) });

  const errMsg = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e as Error).message;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-2 mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">Ownership verification</span>
        <div className="w-44">
          <Select value={method} onChange={e => setMethod(e.target.value as 'bind' | 'external')}>
            <option value="bind">via our BIND</option>
            <option value="external">external (public DNS)</option>
          </Select>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => start.mutate()} disabled={start.isPending}>Get token</Button>
        {challenge && <Button type="button" size="sm" onClick={() => check.mutate()} disabled={check.isPending}>{check.isPending ? 'Checking…' : 'Check'}</Button>}
      </div>

      {challenge && (
        <div className="text-xs text-gray-400 space-y-1">
          <div>Publish this TXT record, then click <span className="text-gray-200">Check</span>:</div>
          <pre className="bg-black rounded p-2 font-mono text-gray-300 whitespace-pre-wrap break-all">{challenge.record.name}.{domain.name}. IN TXT "{challenge.record.value}"</pre>
        </div>
      )}

      {check.isSuccess && (check.data.verified
        ? <Alert kind="success">Verified via {check.data.method}.</Alert>
        : <Alert kind="error">Not found yet — no matching TXT for {check.data.checked} on {check.data.servers.join(', ')}.</Alert>)}
      {check.isError && <Alert kind="error">{errMsg(check.error)}</Alert>}
      {start.isError && <Alert kind="error">{errMsg(start.error)}</Alert>}
    </div>
  );
}

function recordRdata(r: DnsRecord): string {
  if (r.type === 'MX') return `${r.priority ?? 10} ${r.value}`;
  if (r.type === 'SRV') return `${r.priority ?? 0} ${r.weight ?? 0} ${r.port ?? 0} ${r.value}`;
  return r.value;
}

function AddRecordForm({ domainId }: { domainId: number }) {
  const qc = useQueryClient();
  const [r, setR] = useState({ name: '@', type: 'A', value: '', priority: '', weight: '', port: '' });
  const add = useMutation({
    mutationFn: () => domainsApi.addRecord(domainId, {
      name: r.name || '@',
      type: r.type,
      value: r.value,
      priority: r.priority ? Number(r.priority) : undefined,
      weight: r.weight ? Number(r.weight) : undefined,
      port: r.port ? Number(r.port) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      qc.invalidateQueries({ queryKey: ['domains'] });
      qc.invalidateQueries({ queryKey: ['dns-preview'] });
      setR({ name: '@', type: 'A', value: '', priority: '', weight: '', port: '' });
    },
  });
  const set = (k: string, v: string) => setR(s => ({ ...s, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); add.mutate(); }} className="flex flex-wrap gap-2 items-center pt-1">
      <div className="w-28"><TextInput placeholder="name (@)" value={r.name} onChange={e => set('name', e.target.value)} /></div>
      <div className="w-24"><Select value={r.type} onChange={e => set('type', e.target.value)}>{RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Select></div>
      <div className="flex-1 min-w-[8rem]"><TextInput placeholder="value" value={r.value} onChange={e => set('value', e.target.value)} required /></div>
      {(r.type === 'MX' || r.type === 'SRV') && <div className="w-16"><TextInput type="number" placeholder="prio" value={r.priority} onChange={e => set('priority', e.target.value)} /></div>}
      {r.type === 'SRV' && <div className="w-16"><TextInput type="number" placeholder="wt" value={r.weight} onChange={e => set('weight', e.target.value)} /></div>}
      {r.type === 'SRV' && <div className="w-16"><TextInput type="number" placeholder="port" value={r.port} onChange={e => set('port', e.target.value)} /></div>}
      <Button type="submit" size="sm" disabled={!r.value || add.isPending}><Plus size={13} /> Add</Button>
    </form>
  );
}

function AddDomainModal({ canManageAll, onClose }: { canManageAll: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', ttl: 3600, primary_ns: 'ns1', admin_email: 'admin' });
  const add = useMutation({ mutationFn: () => domainsApi.create(form), onSuccess: onClose });
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  // Scoped users self-onboard by delegating NS; fetch the target nameservers to show them.
  const ns = useQuery({ queryKey: ['ns-config'], queryFn: domainsApi.nameservers, enabled: !canManageAll });
  const blockedSelfService = !canManageAll && ns.data?.selfService === false;

  return (
    <Modal title="Add Domain" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); add.mutate(); }} className="space-y-4">
        <Field label="Domain name"><TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="example.com" required /></Field>

        {canManageAll ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="TTL"><TextInput type="number" value={form.ttl} onChange={e => set('ttl', Number(e.target.value))} /></Field>
            <Field label="Primary NS"><TextInput value={form.primary_ns} onChange={e => set('primary_ns', e.target.value)} /></Field>
            <Field label="Admin email"><TextInput value={form.admin_email} onChange={e => set('admin_email', e.target.value)} /></Field>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-xs">
            {ns.isLoading && <span className="text-gray-500">Loading…</span>}
            {ns.data && !ns.data.selfService && (
              <Alert kind="error">Self-service onboarding is disabled. Ask an administrator to assign domains to you.</Alert>
            )}
            {ns.data && ns.data.selfService && (ns.data.nameservers.length === 0 ? (
              <Alert kind="error">No nameservers are configured yet. Ask an administrator to set them in DNS settings.</Alert>
            ) : (
              <div className="text-gray-400 space-y-1">
                <div>To add this domain, delegate it to our nameservers at your registrar:</div>
                <pre className="bg-black rounded p-2 font-mono text-gray-300 whitespace-pre-wrap break-all">{ns.data.nameservers.join('\n')}</pre>
                <div className="text-gray-600">We verify the delegation via public DNS when you submit.</div>
              </div>
            ))}
          </div>
        )}

        {add.isError && (
          <Alert kind="error">
            {(add.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (add.error as Error).message}
          </Alert>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!form.name || add.isPending || blockedSelfService}>{add.isPending ? 'Adding…' : 'Add Domain'}</Button>
        </div>
      </form>
    </Modal>
  );
}
