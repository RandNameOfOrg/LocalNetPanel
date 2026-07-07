import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db/db';
import { getDeviceAndCred, runCommand } from '../services/ssh.service';
import { wakeDevice } from '../services/wol.service';
import { powerCommand, OsType } from '../lib/os-commands';
import { asyncHandler, parseBody, intParam } from '../lib/http';
import { badRequest } from '../lib/errors';
import { isValidMac } from '../lib/net';

const router = Router({ mergeParams: true });

const PowerSchema = z.object({
  action: z.enum(['shutdown', 'reboot', 'wake']),
  credentialId: z.number().int().optional(),
  delay: z.number().int().min(0).default(0),
});

router.post('/', asyncHandler(async (req, res) => {
  const { action, credentialId, delay } = parseBody(PowerSchema, req.body);
  const deviceId = intParam(req);

  if (action === 'wake') {
    const device = await queryOne<{ mac: string | null }>('SELECT mac FROM devices WHERE id = ?', [deviceId]);
    if (!device?.mac) throw badRequest('Device has no MAC address');
    if (!isValidMac(device.mac)) throw badRequest(`Invalid MAC address: "${device.mac}"`);
    await wakeDevice(device.mac);
    res.json({ ok: true, action: 'wake' });
    return;
  }

  if (!credentialId) throw badRequest('credentialId required for shutdown/reboot');
  const { device, cred } = await getDeviceAndCred(deviceId, credentialId);
  const cmd = powerCommand(device.os_type as OsType, action, delay);
  await runCommand(device, cred, cmd);
  res.json({ ok: true, action, cmd });
}));

export default router;
