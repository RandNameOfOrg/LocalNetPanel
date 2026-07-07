import { Select } from './ui/inputs';
import { useDevices } from '../hooks/useDevices';

interface Props {
  value: string;
  onChange: (deviceId: string) => void;
  placeholder?: string;
}

/** Dropdown of all devices, wired to the shared devices query. */
export default function DeviceSelect({ value, onChange, placeholder = 'Select device…' }: Props) {
  const { data: devices = [] } = useDevices();
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
    </Select>
  );
}
