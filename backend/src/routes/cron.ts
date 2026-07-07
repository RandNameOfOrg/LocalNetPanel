import { Router } from 'express';
import { z } from 'zod';
import cron from 'node-cron';
import { queryAll, execute } from '../db/db';
import { syncJob, unscheduleJob, readJobLog } from '../services/cron.service';
import { requirePermission } from '../middleware/auth.middleware';
import { asyncHandler, parseBody, intParam } from '../lib/http';
import { buildUpdate } from '../lib/sql';

const router = Router();

const JobSchema = z.object({
  name: z.string().min(1),
  schedule: z.string().refine(s => cron.validate(s), { message: 'Invalid cron expression' }),
  device_id: z.number().int(),
  credential_id: z.number().int(),
  command: z.string().min(1),
  enabled: z.boolean().default(true),
});

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await queryAll('SELECT * FROM cron_jobs ORDER BY name'));
}));

router.post('/', requirePermission('cron'), asyncHandler(async (req, res) => {
  const j = parseBody(JobSchema, req.body);
  const result = await execute(
    'INSERT INTO cron_jobs (name, schedule, device_id, credential_id, command, enabled) VALUES (?, ?, ?, ?, ?, ?)',
    [j.name, j.schedule, j.device_id, j.credential_id, j.command, j.enabled ? 1 : 0],
  );
  const id = Number(result.lastInsertRowid);
  await syncJob(id);
  res.status(201).json({ id });
}));

router.put('/:id', requirePermission('cron'), asyncHandler(async (req, res) => {
  const j = parseBody(JobSchema.partial(), req.body);
  const id = intParam(req);
  const patch = { ...j, enabled: j.enabled === undefined ? undefined : j.enabled ? 1 : 0 };
  const { clause, values } = buildUpdate(patch);
  await execute(`UPDATE cron_jobs SET ${clause} WHERE id = ?`, [...values, id]);
  await syncJob(id);
  res.json({ ok: true });
}));

router.delete('/:id', requirePermission('cron'), asyncHandler(async (req, res) => {
  const id = intParam(req);
  unscheduleJob(id);
  await execute('DELETE FROM cron_jobs WHERE id = ?', [id]);
  res.json({ ok: true });
}));

router.get('/:id/logs', asyncHandler(async (req, res) => {
  const lines = req.query.lines ? Number(req.query.lines) : 100;
  res.json({ logs: readJobLog(intParam(req), lines) });
}));

export default router;
