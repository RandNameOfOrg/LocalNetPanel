import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { decrypt } from './crypto.service';
import { queryOne } from '../db/db';
import { notFound } from '../lib/errors';

export interface DeviceCredential {
  id: number; device_id: number; username: string;
  auth_type: 'password' | 'key'; secret: string | null; passphrase: string | null;
}

export interface Device { id: number; ip: string; port: number; os_type: string; }

export function buildConnectConfig(device: Device, cred: DeviceCredential): ConnectConfig {
  const base: ConnectConfig = { host: device.ip, port: device.port, username: cred.username, readyTimeout: 10000 };
  if (cred.auth_type === 'password') {
    return { ...base, password: cred.secret ? decrypt(cred.secret) : '' };
  }
  return {
    ...base,
    privateKey: cred.secret ? decrypt(cred.secret) : '',
    passphrase: cred.passphrase ? decrypt(cred.passphrase) : undefined,
  };
}

/** Load a device and one of its credentials, throwing AppError(404) if either is missing. */
export async function getDeviceAndCred(deviceId: number, credentialId: number) {
  const device = await queryOne<Device>('SELECT id, ip, port, os_type FROM devices WHERE id = ?', [deviceId]);
  if (!device) throw notFound('Device not found');
  const cred = await queryOne<DeviceCredential>(
    'SELECT id, device_id, username, auth_type, secret, passphrase FROM device_credentials WHERE id = ? AND device_id = ?',
    [credentialId, deviceId],
  );
  if (!cred) throw notFound('Credential not found');
  return { device, cred };
}

/**
 * Open an SSH connection, run `fn` once it is ready, and always close the
 * connection afterwards. Centralises the connect/ready/error/cleanup dance so
 * callers only write the part they care about.
 */
export function withSSH<T>(device: Device, cred: DeviceCredential, fn: (conn: Client) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        fn(conn).then(resolve, reject).finally(() => conn.end());
      })
      .on('error', reject)
      .connect(buildConnectConfig(device, cred));
  });
}

/** Like {@link withSSH} but hands `fn` an open SFTP session. */
export function withSFTP<T>(device: Device, cred: DeviceCredential, fn: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
  return withSSH(device, cred, conn =>
    new Promise<T>((resolve, reject) => {
      conn.sftp((err, sftp) => (err ? reject(err) : fn(sftp).then(resolve, reject)));
    }),
  );
}

/** Run a single command over SSH and resolve with its combined stdout+stderr. */
export function runCommand(device: Device, cred: DeviceCredential, command: string): Promise<string> {
  return withSSH(device, cred, conn =>
    new Promise<string>((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { output += d.toString(); });
        stream.on('close', () => resolve(output.trim()));
      });
    }),
  );
}
