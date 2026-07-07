import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../api/devices';

/** SSH credentials for a device. Disabled (no fetch) until a device id is given. */
export const useCredentials = (deviceId: number | string | null | undefined) => {
  const id = Number(deviceId);
  return useQuery({
    queryKey: ['device-creds', id],
    queryFn: () => devicesApi.listCredentials(id),
    enabled: !!id,
  });
};
