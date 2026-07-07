# Backend — Local Network Panel

Express + TypeScript API, WebSocket SSH terminal, and cron runner. Data is
stored in SQLite via `@libsql/client` (no native build step required).

See the [root README](../README.md) for full setup and the complete **API
reference**; this file is a quick reference for working inside `backend/`.

## Setup

```bash
npm install
cp .env.example .env     # then fill in real secrets (see root README)
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start with hot reload (`tsx watch`) on port 3001 |
| `npm run build` | Compile TypeScript to `dist/` **and copy `db/schema.sql` into `dist/db/`** |
| `npm start` | Run the compiled server (`node dist/index.js`) |
| `npm run typecheck` | Type-check without emitting |
| `npm run db:migrate` | Create / update the SQLite schema |
| `npm run db:reset` | **Delete** the DB file and recreate it (dev only) |
| `npm run user -- <cmd>` | Manage panel users from the CLI (see below) |

> **Why the copy step?** `db.ts` reads `schema.sql` at runtime relative to its
> own folder. `tsc` only emits `.js`, so the build copies the `.sql` file next
> to the compiled `dist/db/db.js`; otherwise `node dist/index.js` would crash on
> `initSchema()`.

### User CLI

```bash
npm run user -- list
npm run user -- create <username> <password> [admin|user] [perm,perm,...]
npm run user -- passwd <username> <newPassword>
npm run user -- rename <oldUsername> <newUsername>
npm run user -- set-role <username> <admin|user>
npm run user -- delete <username>
```

## Stop

- Foreground: **Ctrl+C**.
- Windows stray process: `taskkill /IM node.exe /F`.
- Linux/macOS: `pkill -f tsx` (dev) or `pkill node`.

## Layout

```
src/
├── index.ts          # App bootstrap: middleware, route mounts, WS server, error handler
├── middleware/
│   └── auth.middleware.ts  # authMiddleware, requireAdmin, requirePermission
├── lib/              # Cross-cutting helpers (no Express coupling beyond http.ts)
│   ├── errors.ts     # AppError + badRequest/unauthorized/forbidden/notFound
│   ├── http.ts       # asyncHandler, parseBody, intParam, errorHandler
│   ├── sql.ts        # buildUpdate (partial UPDATE), nowSeconds
│   ├── os-commands.ts# Linux/Windows power + info command strings
│   ├── net.ts        # isValidMac (MAC format validation)
│   └── permissions.ts# PERMISSIONS list + userHasPermission (admin/implication rules)
├── routes/           # REST controllers — one per resource:
│   │                 #   auth, devices, power, info, files, commands, cron,
│   │                 #   users, discover, domains, adguard
├── services/         # Business logic:
│   │                 #   ssh (withSSH/withSFTP/runCommand), crypto (AES-256-GCM),
│   │                 #   auth (JWT + refresh rotation), cron, wol, discovery
│   │                 #   (ping-sweep + ARP), bind (zone rendering + SFTP apply),
│   │                 #   verify (TXT ownership + NS-delegation check), adguard
├── ws/terminal.ts    # SSH shell over WebSocket (gated by the `terminal` permission)
├── cli/users.ts      # `npm run user` entrypoint
└── db/               # schema.sql + libsql client + query helpers + migrate/reset
```

## Conventions

- Route handlers are wrapped in `asyncHandler(...)` and **throw** `AppError`
  (`badRequest` / `forbidden` / `notFound` / …) instead of writing error
  responses by hand — the global `errorHandler` in `index.ts` formats them.
- Validate request bodies with `parseBody(schema, req.body)`; read params with
  `intParam(req, 'id')`.
- Gate routes with `requirePermission('<perm>')`; `manage_domains` implies the
  scoped `domains` permission.
- Open SSH/SFTP connections via `withSSH` / `withSFTP` so cleanup is automatic.
- Build partial `UPDATE` statements with `buildUpdate(...)`.
- Keep OS-specific command strings in `os-commands.ts`, not inline in routes.

## Database

Schema lives in [`src/db/schema.sql`](src/db/schema.sql). Tables: `panel_users`,
`refresh_tokens`, `devices`, `device_credentials`, `saved_commands`,
`cron_jobs`, `dns_config`, `domains`, `dns_records`, `domain_users`. Additive
column changes are applied idempotently by `runMigrations()` in `db.ts` on every
startup, so `CREATE TABLE IF NOT EXISTS` + `ALTER … ADD COLUMN` keep old DBs current.
