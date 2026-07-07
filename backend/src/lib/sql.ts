import { type InValue } from '@libsql/client';
import { AppError } from './errors';

/**
 * Builds the `SET col = ?, ...` clause and ordered values for a partial UPDATE
 * from a plain object, skipping `undefined` fields. Throws AppError(400) if
 * there is nothing to update.
 *
 * @example
 *   const { clause, values } = buildUpdate({ name, ip });
 *   await execute(`UPDATE devices SET ${clause} WHERE id = ?`, [...values, id]);
 */
export function buildUpdate(data: Record<string, unknown>): { clause: string; values: InValue[] } {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) throw new AppError(400, 'Nothing to update');
  return {
    clause: entries.map(([key]) => `${key} = ?`).join(', '),
    values: entries.map(([, value]) => value as InValue),
  };
}

/** Current Unix time in seconds (matches SQLite's `unixepoch()`). */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
