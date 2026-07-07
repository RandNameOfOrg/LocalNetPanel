import wol from 'wake_on_lan';

export function wakeDevice(mac: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wol.wake(mac, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
