import { Router } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, execute } from '../db/db';
import { getDeviceAndCred, runCommand } from '../services/ssh.service';
import { requirePermission } from '../middleware/auth.middleware';
import { asyncHandler, parseBody, intParam } from '../lib/http';
import { notFound } from '../lib/errors';

const router = Router();

const CommandSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  description: z.string().optional(),
});

const RunSchema = z.object({
  deviceId: z.number().int(),
  credentialId: z.number().int(),
});

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await queryAll('SELECT * FROM saved_commands ORDER BY name'));
}));

router.post('/', requirePermission('commands'), asyncHandler(async (req, res) => {
  const c = parseBody(CommandSchema, req.body);
  const result = await execute(
    'INSERT INTO saved_commands (name, command, description) VALUES (?, ?, ?)',
    [c.name, c.command, c.description ?? null],
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.delete('/:id', requirePermission('commands'), asyncHandler(async (req, res) => {
  await execute('DELETE FROM saved_commands WHERE id = ?', [intParam(req)]);
  res.json({ ok: true });
}));

router.post('/:id/run', requirePermission('commands'), asyncHandler(async (req, res) => {
  const { deviceId, credentialId } = parseBody(RunSchema, req.body);
  const cmd = await queryOne<{ command: string }>('SELECT command FROM saved_commands WHERE id = ?', [intParam(req)]);
  if (!cmd) throw notFound('Command not found');

  const { device, cred } = await getDeviceAndCred(deviceId, credentialId);
  res.json({ output: await runCommand(device, cred, cmd.command) });
}));

export default router;
