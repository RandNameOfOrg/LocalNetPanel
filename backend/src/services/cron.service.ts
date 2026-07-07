import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { queryAll, execute } from '../db/db';
import { getDeviceAndCred, runCommand } from './ssh.service';

const LOGS_DIR = process.env.LOGS_DIR ?? './logs';
const scheduledTasks = new Map<number, cron.ScheduledTask>();

export interface CronJob {
  id: number; name: string; schedule: string;
  device_id: number; credential_id: number; command: string; enabled: number;
}

const logFilePath = (jobId: number) => path.join(LOGS_DIR, `${jobId}.log`);

function appendLog(jobId: number, content: string) {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(logFilePath(jobId), `[${new Date().toISOString()}] ${content}\n`);
}

/** Read the last `lines` lines of a job's log file (empty string if none yet). */
export function readJobLog(jobId: number, lines = 100): string {
  const file = logFilePath(jobId);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
}

function runJob(job: CronJob) {
  return async () => {
    try {
      const { device, cred } = await getDeviceAndCred(job.device_id, job.credential_id);
      const output = await runCommand(device, cred, job.command);
      appendLog(job.id, `OK: ${output}`);
      await execute("UPDATE cron_jobs SET last_run = unixepoch(), last_status = 'success' WHERE id = ?", [job.id]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(job.id, `ERROR: ${msg}`);
      await execute("UPDATE cron_jobs SET last_run = unixepoch(), last_status = 'error' WHERE id = ?", [job.id]);
    }
  };
}

export function scheduleJob(job: CronJob) {
  unscheduleJob(job.id);
  if (!cron.validate(job.schedule)) { console.warn(`Cron: invalid schedule for job ${job.id}`); return; }
  scheduledTasks.set(job.id, cron.schedule(job.schedule, runJob(job), { timezone: 'UTC' }));
}

export function unscheduleJob(jobId: number) {
  const task = scheduledTasks.get(jobId);
  if (task) { task.stop(); scheduledTasks.delete(jobId); }
}

/** Reschedule a job from the DB by id (used after create/update). */
export async function syncJob(jobId: number) {
  unscheduleJob(jobId);
  const [job] = await queryAll<CronJob>('SELECT * FROM cron_jobs WHERE id = ?', [jobId]);
  if (job?.enabled) scheduleJob(job);
}

export async function loadJobs() {
  const jobs = await queryAll<CronJob>('SELECT * FROM cron_jobs WHERE enabled = 1');
  for (const job of jobs) scheduleJob(job);
  console.log(`Cron: loaded ${jobs.length} job(s)`);
}
