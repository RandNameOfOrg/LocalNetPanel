import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Shield, User as UserIcon } from 'lucide-react';
import { usersApi, PanelUser, UserInput } from '../api/users';
import { useAuthStore } from '../store/auth';
import { PERMISSION_LABELS, PERMISSIONS } from '../lib/permissions';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';
import { TextInput, Select } from '../components/ui/inputs';

export default function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore(s => s.user);
  const [editing, setEditing] = useState<PanelUser | 'new' | null>(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Users</h1>
        <Button onClick={() => setEditing('new')}><Plus size={16} /> Add user</Button>
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              {u.role === 'admin'
                ? <Shield size={16} className="text-blue-400 flex-shrink-0" />
                : <UserIcon size={16} className="text-gray-500 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">
                  {u.username}
                  {me?.id === u.id && <span className="ml-2 text-xs text-gray-500">(you)</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {u.role === 'admin' ? 'Administrator · all permissions' : (u.permissions.length
                    ? u.permissions.map(p => PERMISSION_LABELS[p] ?? p).join(', ')
                    : 'No permissions')}
                </div>
              </div>
              <button onClick={() => setEditing(u)} className="text-gray-500 hover:text-white" title="Edit">
                <Pencil size={14} />
              </button>
              {me?.id !== u.id && (
                <button
                  onClick={() => { if (confirm(`Delete user "${u.username}"?`)) deleteMutation.mutate(u.id); }}
                  className="text-gray-600 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserModal({ user, onClose }: { user: PanelUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>(user?.role ?? 'user');
  const [permissions, setPermissions] = useState<string[]>(user?.permissions ?? []);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<UserInput> = { username, role, permissions };
      if (password) payload.password = password;
      if (isEdit) await usersApi.update(user!.id, payload);
      else await usersApi.create({ username, password, role, permissions } as UserInput);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
  });

  const toggle = (perm: string) =>
    setPermissions(prev => (prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]));

  return (
    <Modal title={isEdit ? `Edit ${user!.username}` : 'Add User'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <Field label="Username">
          <TextInput value={username} onChange={e => setUsername(e.target.value)} required />
        </Field>
        <Field label={isEdit ? 'New password (leave blank to keep)' : 'Password'}>
          <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} required={!isEdit} minLength={6} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={e => setRole(e.target.value as 'admin' | 'user')}>
            <option value="user">User</option>
            <option value="admin">Admin (full access)</option>
          </Select>
        </Field>

        <div>
          <label className="block text-xs text-gray-400 mb-2">Permissions</label>
          {role === 'admin' ? (
            <p className="text-xs text-gray-500">Admins have all permissions.</p>
          ) : (
            <div className="space-y-1.5">
              {PERMISSIONS.map(perm => (
                <label key={perm} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm)}
                    onChange={() => toggle(perm)}
                    className="accent-blue-600"
                  />
                  {PERMISSION_LABELS[perm]}
                </label>
              ))}
            </div>
          )}
        </div>

        {mutation.isError && (
          <Alert kind="error">
            {(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error
              ?? (mutation.error as Error).message}
          </Alert>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}
