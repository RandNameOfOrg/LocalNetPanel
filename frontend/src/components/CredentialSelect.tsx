import { Select } from './ui/inputs';
import { useCredentials } from '../hooks/useCredentials';

interface Props {
  deviceId: string | number | null | undefined;
  value: string;
  onChange: (credentialId: string) => void;
  placeholder?: string;
}

/** Dropdown of a device's SSH credentials. Disabled until a device is chosen. */
export default function CredentialSelect({ deviceId, value, onChange, placeholder = 'Select user…' }: Props) {
  const { data: creds = [] } = useCredentials(deviceId);
  return (
    <Select value={value} onChange={e => onChange(e.target.value)} disabled={!deviceId}>
      <option value="">{placeholder}</option>
      {creds.map(c => <option key={c.id} value={c.id}>{c.label} ({c.username})</option>)}
    </Select>
  );
}
