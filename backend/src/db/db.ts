import { createClient, type InValue } from '@libsql/client';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH ?? './data/panel.db';
const dataDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = createClient({ url: `file:${DB_PATH}` });

export async function queryOne<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  const result = await db.execute({ sql, args });
  return result.rows[0] as T | undefined;
}

export async function queryAll<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const result = await db.execute({ sql, args });
  return result.rows as T[];
}

export async function execute(sql: string, args: InValue[] = []) {
  return db.execute({ sql, args });
}

/** True if `column` exists on `table` (used for idempotent migrations). */
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await queryAll<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some(r => r.name === column);
}

/** Idempotent ALTERs for schemas that predate a column (CREATE IF NOT EXISTS won't add columns). */
async function runMigrations() {
  if (!(await columnExists('panel_users', 'permissions'))) {
    await execute('ALTER TABLE panel_users ADD COLUMN permissions TEXT');
  }
  if (!(await columnExists('dns_config', 'nameservers'))) {
    await execute("ALTER TABLE dns_config ADD COLUMN nameservers TEXT NOT NULL DEFAULT ''");
  }
  if (!(await columnExists('dns_config', 'allow_self_service'))) {
    await execute('ALTER TABLE dns_config ADD COLUMN allow_self_service INTEGER NOT NULL DEFAULT 0');
  }
}

export async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // libsql doesn't support multi-statement exec via execute(), use executeMultiple
  await db.executeMultiple(schema);
  await runMigrations();
}

export default db;
