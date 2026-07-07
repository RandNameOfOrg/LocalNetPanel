import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Terminal as TerminalIcon, ChevronLeft, Maximize2 } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useAuthStore } from '../store/auth';
import { base64ToBytes, stringToBase64 } from '../lib/base64';
import '@xterm/xterm/css/xterm.css';

type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

const STATUS_STYLES: Record<Status, string> = {
  connected: 'bg-green-900 text-green-300',
  connecting: 'bg-yellow-900 text-yellow-300',
  disconnected: 'bg-red-900 text-red-300',
  error: 'bg-red-900 text-red-300',
};

export default function TerminalPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAuthStore(s => s.accessToken);
  const termRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  const credentialId = searchParams.get('credentialId') ?? (location.state as { credentialId?: number })?.credentialId;

  useEffect(() => {
    if (!termRef.current || !id || !credentialId || !token) return;

    const term = new Terminal({
      theme: { background: '#0a0a0a', foreground: '#e5e7eb', cursor: '#60a5fa' },
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);
    fitAddon.fit();

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/ws/terminal?deviceId=${id}&credentialId=${credentialId}&token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { type: string; data?: string; message?: string };
      if (msg.type === 'data' && msg.data) {
        term.write(base64ToBytes(msg.data));
      } else if (msg.type === 'connected') {
        setStatus('connected');
      } else if (msg.type === 'error') {
        setStatus('error');
        setErrorMsg(msg.message ?? 'Connection error');
      } else if (msg.type === 'closed') {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => { setStatus('error'); setErrorMsg('WebSocket error'); };
    ws.onclose = () => setStatus(s => (s === 'connected' ? 'disconnected' : s));

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: stringToBase64(data) }));
      }
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      }
    });
    ro.observe(termRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [id, credentialId, token]);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <TerminalIcon size={16} className="text-blue-400" />
        <span className="text-sm text-gray-300">SSH Terminal</span>
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ml-2 ${STATUS_STYLES[status]}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {status}
        </span>
        {errorMsg && <span className="text-xs text-red-400">{errorMsg}</span>}
        <button onClick={() => document.documentElement.requestFullscreen()} className="ml-auto text-gray-500 hover:text-white">
          <Maximize2 size={14} />
        </button>
      </div>

      <div ref={termRef} className="flex-1 p-2" />
    </div>
  );
}
