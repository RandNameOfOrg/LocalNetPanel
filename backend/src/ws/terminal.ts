import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { Client, ClientChannel } from 'ssh2';
import { getDeviceAndCred, buildConnectConfig } from '../services/ssh.service';
import { userHasPermission } from '../lib/permissions';

export function attachTerminalWS(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const token = url.searchParams.get('token');
    const deviceId = Number(url.searchParams.get('deviceId'));
    const credentialId = Number(url.searchParams.get('credentialId'));

    let claims: { role?: string; permissions?: string[] };
    try {
      claims = jwt.verify(token ?? '', process.env.JWT_SECRET ?? '') as { role?: string; permissions?: string[] };
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
      return;
    }

    if (!userHasPermission(claims, 'terminal')) {
      ws.send(JSON.stringify({ type: 'error', message: "Forbidden: missing 'terminal' permission" }));
      ws.close(1008, 'Forbidden');
      return;
    }

    let deviceCred: Awaited<ReturnType<typeof getDeviceAndCred>>;
    try {
      deviceCred = await getDeviceAndCred(deviceId, credentialId);
    } catch (e: unknown) {
      ws.send(JSON.stringify({ type: 'error', message: (e as Error).message }));
      ws.close(1011, 'Device/credential not found');
      return;
    }

    const { device, cred } = deviceCred;
    const ssh = new Client();
    let stream: ClientChannel | null = null;

    ssh
      .on('ready', () => {
        ssh.shell({ term: 'xterm-256color', rows: 24, cols: 80 }, (err, sh) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
            ws.close();
            return;
          }
          stream = sh;
          ws.send(JSON.stringify({ type: 'connected' }));

          sh.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }));
            }
          });

          sh.stderr?.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }));
            }
          });

          sh.on('close', () => {
            ws.send(JSON.stringify({ type: 'closed' }));
            ws.close();
          });
        });
      })
      .on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
      })
      .connect(buildConnectConfig(device, cred));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string; rows?: number; cols?: number };
        if (msg.type === 'input' && stream && msg.data) {
          stream.write(Buffer.from(msg.data, 'base64'));
        } else if (msg.type === 'resize' && stream && msg.rows && msg.cols) {
          (stream as unknown as { setWindow: (r: number, c: number, h: number, w: number) => void })
            .setWindow(msg.rows, msg.cols, 0, 0);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      stream?.end();
      ssh.end();
    });
  });
}
