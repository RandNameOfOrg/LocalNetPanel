import { Router } from 'express';
import { getDeviceAndCred, runCommand } from '../services/ssh.service';
import { infoCommand, OsType } from '../lib/os-commands';
import { asyncHandler, intParam, requireIntQuery } from '../lib/http';
import { badRequest } from '../lib/errors';

const router = Router({ mergeParams: true });

router.get('/', asyncHandler(async (req, res) => {
  const deviceId = intParam(req);
  const credentialId = requireIntQuery(req, 'credentialId');
  const type = (req.query.type as string) ?? 'basic';

  const { device, cred } = await getDeviceAndCred(deviceId, credentialId);
  const cmd = infoCommand(device.os_type as OsType, type);
  if (!cmd) throw badRequest(`Unknown info type: ${type}`);

  res.json({ type, output: await runCommand(device, cred, cmd) });
}));

export default router;
