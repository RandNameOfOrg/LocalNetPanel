import { useState, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '../api/devices';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Button from './ui/Button';
import Alert from './ui/Alert';
import { TextInput, Textarea, Select } from './ui/inputs';

export default function AddCredentialModal({ deviceId, onClose }: { deviceId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    label: '', username: '', auth_type: 'password' as 'password' | 'key', secret: '', passphrase: '',
  });

  const mutation = useMutation({
    mutationFn: () => devicesApi.addCredential(deviceId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['device-creds', deviceId] }); onClose(); },
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal title="Add SSH Credential" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <Field label="Label (display name)">
          <TextInput value={form.label} onChange={e => set('label', e.target.value)} placeholder="root, deploy, admin…" required />
        </Field>
        <Field label="Username">
          <TextInput value={form.username} onChange={e => set('username', e.target.value)} required />
        </Field>
        <Field label="Auth type">
          <Select value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
            <option value="password">Password</option>
            <option value="key">Private key</option>
          </Select>
        </Field>
        {form.auth_type === 'password' ? (
          <Field label="Password">
            <TextInput type="password" value={form.secret} onChange={e => set('secret', e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="Private key (PEM)">
              <Textarea
                className="font-mono h-28 resize-none"
                value={form.secret}
                onChange={e => set('secret', e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
            </Field>
            <Field label="Passphrase (if any)">
              <TextInput type="password" value={form.passphrase} onChange={e => set('passphrase', e.target.value)} />
            </Field>
          </>
        )}

        {mutation.isError && <Alert kind="error">{(mutation.error as Error).message}</Alert>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}
