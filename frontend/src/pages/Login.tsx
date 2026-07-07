import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { TextInput } from '../components/ui/inputs';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ accessToken: string; user: { id: number; username: string; role: string } }>(
        '/auth/login',
        { username, password },
      );
      setAuth(res.data.accessToken, res.data.user);
      navigate('/');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <Terminal size={28} className="text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Network Panel</h1>
        </div>

        <form onSubmit={submit} className="bg-gray-900 rounded-xl p-8 space-y-5 border border-gray-800">
          {error && <Alert kind="error">{error}</Alert>}

          <Field label="Username">
            <TextInput value={username} onChange={e => setUsername(e.target.value)} autoFocus required />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </Field>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          No account yet?{' '}
          <Link to="/setup" className="text-blue-400 hover:underline">Initial setup</Link>
        </p>
      </div>
    </div>
  );
}
