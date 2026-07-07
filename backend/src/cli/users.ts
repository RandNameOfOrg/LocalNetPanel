import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initSchema, queryOne, queryAll, execute } from '../db/db';
import { parsePermissions, isPermission } from '../lib/permissions';

/**
 * Server-side panel user administration — no panel login required.
 *
 *   npm run user -- list
 *   npm run user -- create <username> <password> [admin|user] [perm,perm,...]
 *   npm run user -- passwd <username> <newPassword>
 *   npm run user -- rename <oldUsername> <newUsername>
 *   npm run user -- set-role <username> <admin|user>
 *   npm run user -- delete <username>
 */

interface Row { id: number; username: string; role: string; permissions: string | null; }

const USAGE = `
Panel user management

Usage:
  npm run user -- list
  npm run user -- create <username> <password> [admin|user] [perm,perm,...]
  npm run user -- passwd <username> <newPassword>
  npm run user -- rename <oldUsername> <newUsername>
  npm run user -- set-role <username> <admin|user>
  npm run user -- delete <username>
`.trim();

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function getUser(username: string): Promise<Row> {
  const row = await queryOne<Row>('SELECT id, username, role, permissions FROM panel_users WHERE username = ?', [username]);
  if (!row) fail(`User '${username}' not found`);
  return row;
}

async function adminCount(): Promise<number> {
  const r = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM panel_users WHERE role = 'admin'");
  return r?.n ?? 0;
}

async function main() {
  await initSchema();
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'list': {
      const rows = await queryAll<Row>('SELECT id, username, role, permissions FROM panel_users ORDER BY username');
      if (rows.length === 0) { console.log('(no users)'); break; }
      for (const r of rows) {
        const perms = r.role === 'admin' ? '(all)' : parsePermissions(r.permissions).join(', ') || '(none)';
        console.log(`#${r.id}  ${r.username.padEnd(20)} ${r.role.padEnd(6)} ${perms}`);
      }
      break;
    }

    case 'create': {
      const [username, password, role = 'user', permsCsv] = args;
      if (!username || !password) fail('Usage: create <username> <password> [admin|user] [perm,perm,...]');
      if (role !== 'admin' && role !== 'user') fail("Role must be 'admin' or 'user'");
      if (await queryOne('SELECT 1 FROM panel_users WHERE username = ?', [username])) fail('Username already taken');

      const perms = (permsCsv ? permsCsv.split(',') : []).map(p => p.trim()).filter(isPermission);
      await execute('INSERT INTO panel_users (username, password, role, permissions) VALUES (?, ?, ?, ?)', [
        username, bcrypt.hashSync(password, 12), role, JSON.stringify(perms),
      ]);
      console.log(`Created ${role} '${username}'${role === 'user' ? ` with permissions: ${perms.join(', ') || '(none)'}` : ''}`);
      break;
    }

    case 'passwd': {
      const [username, newPassword] = args;
      if (!username || !newPassword) fail('Usage: passwd <username> <newPassword>');
      await getUser(username);
      await execute('UPDATE panel_users SET password = ? WHERE username = ?', [bcrypt.hashSync(newPassword, 12), username]);
      console.log(`Password updated for '${username}'`);
      break;
    }

    case 'rename': {
      const [oldName, newName] = args;
      if (!oldName || !newName) fail('Usage: rename <oldUsername> <newUsername>');
      await getUser(oldName);
      if (await queryOne('SELECT 1 FROM panel_users WHERE username = ?', [newName])) fail(`Username '${newName}' already taken`);
      await execute('UPDATE panel_users SET username = ? WHERE username = ?', [newName, oldName]);
      console.log(`Renamed '${oldName}' -> '${newName}'`);
      break;
    }

    case 'set-role': {
      const [username, role] = args;
      if (!username || !role) fail('Usage: set-role <username> <admin|user>');
      if (role !== 'admin' && role !== 'user') fail("Role must be 'admin' or 'user'");
      const user = await getUser(username);
      if (user.role === 'admin' && role === 'user' && (await adminCount()) <= 1) fail('Cannot demote the last admin');
      await execute('UPDATE panel_users SET role = ? WHERE username = ?', [role, username]);
      console.log(`Set role of '${username}' to ${role}`);
      break;
    }

    case 'delete': {
      const [username] = args;
      if (!username) fail('Usage: delete <username>');
      const user = await getUser(username);
      if (user.role === 'admin' && (await adminCount()) <= 1) fail('Cannot delete the last admin');
      await execute('DELETE FROM panel_users WHERE username = ?', [username]);
      console.log(`Deleted '${username}'`);
      break;
    }

    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
