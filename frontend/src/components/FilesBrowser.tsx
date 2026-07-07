import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, FileText, ChevronRight, Home, Upload } from 'lucide-react';
import { devicesApi } from '../api/devices';
import { formatBytes } from '../lib/format';
import Button from './ui/Button';
import Alert from './ui/Alert';

interface Entry { name: string; type: 'file' | 'directory'; size: number; mtime: number; }

export default function FilesBrowser({ deviceId, credentialId }: { deviceId: number; credentialId: number | null }) {
  const [path, setPath] = useState('/');
  const [viewing, setViewing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['files', deviceId, credentialId, path],
    queryFn: () => devicesApi.listFiles(deviceId, credentialId!, path),
    enabled: !!credentialId,
  });

  const { data: fileContent } = useQuery({
    queryKey: ['file-content', deviceId, credentialId, viewing],
    queryFn: () => devicesApi.readFile(deviceId, credentialId!, viewing!),
    enabled: !!credentialId && !!viewing,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => devicesApi.uploadFile(deviceId, credentialId!, path, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', deviceId, credentialId, path] }),
  });

  if (!credentialId) return <div className="text-sm text-gray-500">Select a credential to browse files.</div>;

  const navigate = (entry: Entry) => {
    if (entry.type === 'directory') {
      setPath(path === '/' ? `/${entry.name}` : `${path}/${entry.name}`);
      setViewing(null);
    } else {
      setViewing(path === '/' ? `/${entry.name}` : `${path}/${entry.name}`);
    }
  };

  const goUp = () => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    setPath(parts.length === 0 ? '/' : `/${parts.join('/')}`);
    setViewing(null);
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  };

  const breadcrumbs = ['/', ...path.split('/').filter(Boolean)];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">Upload to <span className="font-mono text-gray-400">{path}</span></span>
        <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={onFilePicked} />
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          <Upload size={13} /> {uploadMutation.isPending ? 'Uploading…' : 'Upload .zip'}
        </Button>
      </div>
      {uploadMutation.isError && (
        <div className="mb-3">
          <Alert kind="error">
            {(uploadMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error
              ?? (uploadMutation.error as Error).message}
          </Alert>
        </div>
      )}
      {uploadMutation.isSuccess && <div className="mb-3"><Alert kind="success">Uploaded to {uploadMutation.data.path}</Alert></div>}

      <div className="flex gap-4 h-96">
        {/* Tree panel */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800 text-xs text-gray-500">
            <button onClick={() => { setPath('/'); setViewing(null); }} className="hover:text-white"><Home size={12} /></button>
            {breadcrumbs.slice(1).map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={10} />
                <button
                  onClick={() => { setPath(`/${breadcrumbs.slice(1, i + 2).join('/')}`); setViewing(null); }}
                  className="hover:text-white"
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>

          {path !== '/' && (
            <button onClick={goUp} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white hover:bg-gray-800 w-full text-left">
              <Folder size={14} /> ..
            </button>
          )}

          {isLoading && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
          {error && <div className="px-3 py-2 text-sm text-red-400">{(error as Error).message}</div>}

          {data?.entries?.map((entry: Entry) => (
            <button
              key={entry.name}
              onClick={() => navigate(entry)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm w-full text-left hover:bg-gray-800 transition-colors ${
                viewing?.endsWith(entry.name) ? 'bg-gray-800 text-white' : 'text-gray-300'
              }`}
            >
              {entry.type === 'directory'
                ? <Folder size={14} className="text-blue-400 flex-shrink-0" />
                : <FileText size={14} className="text-gray-500 flex-shrink-0" />}
              <span className="truncate">{entry.name}</span>
              {entry.type === 'file' && (
                <span className="ml-auto text-xs text-gray-600">{formatBytes(entry.size)}</span>
              )}
            </button>
          ))}
        </div>

        {/* File content panel */}
        {viewing && (
          <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
            <div className="px-3 py-2 border-b border-gray-800 text-xs text-gray-500 font-mono truncate">{viewing}</div>
            <pre className="px-3 py-3 text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
              {fileContent?.content ?? 'Loading…'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
