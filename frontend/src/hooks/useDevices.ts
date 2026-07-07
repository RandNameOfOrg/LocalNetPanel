import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../api/devices';

/** All registered devices. */
export const useDevices = () => useQuery({ queryKey: ['devices'], queryFn: devicesApi.list });

/** A single device by id. */
export const useDevice = (id: number) =>
  useQuery({ queryKey: ['device', id], queryFn: () => devicesApi.get(id), enabled: !!id });
