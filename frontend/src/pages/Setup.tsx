import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import { api } from '../api/client';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { TextInput } from '../components/ui/inputs';

export default function Setup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/setup', { username, password });
      navigate('/login');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <Terminal size={28} className="text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Initial Setup</h1>
        </div>

        <form onSubmit={submit} className="bg-gray-900 rounded-xl p-8 space-y-5 border border-gray-800">
          <p className="text-sm text-gray-400">Create the first admin account. This page is only available once.</p>

          {error && <Alert kind="error">{error}</Alert>}

          <Field label="Admin username">
            <TextInput value={username} onChange={e => setUsername(e.target.value)} autoFocus required />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </Field>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating…' : 'Create admin account'}
          </Button>
        </form>
      </div>
    </div>
  );
}
