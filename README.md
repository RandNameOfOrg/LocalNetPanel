# Local Network Panel

A web panel for managing devices on a local network over SSH — power control,
Wake-on-LAN, an in-browser SSH terminal, live system info, a remote file
browser, saved commands, scheduled (cron) checks, DNS/domain management via
BIND, an optional AdGuard Home status view, and role-based access control for
multiple panel users.

- **Backend:** Node.js + TypeScript + Express, SQLite (`@libsql/client`)
- **Frontend:** React + Vite + TypeScript + TailwindCSS (responsive; works on phones)
- **Realtime:** WebSocket + `ssh2` + xterm.js terminal
- **Auth:** JWT access tokens + rotating refresh tokens + per-feature permissions
- **Secrets:** SSH passwords / private keys are AES-256-GCM encrypted at rest

> Architecture details for contributors live in [CLAUDE.md](CLAUDE.md).

---

## Features

| Area | What you can do |
|------|-----------------|
| Power | Shutdown / reboot (Linux & Windows) with optional delay; Wake-on-LAN |
| Terminal | Full interactive SSH shell in the browser (xterm.js over WebSocket) |
| System info | Network, uptime, CPU / RAM / GPU, disk, processes, Docker |
| Credentials | Multiple SSH users per device; password **or** private-key auth |
| Files | Browse remote directories, read files, and upload `.zip` over SFTP |
| Commands | Save reusable commands and run them on any device |
| Cron | Schedule commands, append results to a per-job log file |
| Discovery | Scan the local subnet (ping-sweep + ARP) to auto-fill new devices |
| Domains / DNS | Manage BIND zones & records; configurable authoritative nameservers; per-domain or global apply |
| Verification | Prove domain ownership via a TXT challenge (public DNS or our BIND) |
| Integrations | Read-only AdGuard Home status (optional, off unless configured) |
| Users & RBAC | Multiple panel users with per-feature permissions; assign domains to users; self-service domain onboarding |

---

## Roles & permissions

Every panel user is either an **admin** (implicitly holds every permission) or a
**user** with an explicit subset of the keys below. Permissions are embedded in
the JWT and enforced on both the API (`requirePermission`) and the UI (`can` /
`useCan` gate nav items, buttons, and routes).

| Permission | Grants |
|------------|--------|
| `manage_devices` | Create / edit / delete devices & SSH credentials; network discovery |
| `power` | Shutdown / reboot / Wake-on-LAN |
| `terminal` | Open the SSH terminal |
| `files` | Browse, read, and upload files (SFTP) |
| `commands` | Create / delete / run saved commands |
| `cron` | Create / edit / delete cron jobs |
| `manage_domains` | Manage **all** domains, DNS settings, previews, global apply, and user↔domain assignments |
| `domains` | Manage **only** assigned (or self-onboarded) domains — implied by `manage_domains` |
| `manage_users` | Administer panel users and their permissions |

---

## Prerequisites

- **Node.js 18+** (developed against Node 24) and npm
- No Python / C++ toolchain required — the SQLite driver ships prebuilt binaries
- A reachable **BIND** server over SSH is only needed if you use the Domains feature

---

## 1. Install

```bash
# From the project root — installs root, backend, and frontend deps
npm run install:all
```

## 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Generate real secrets and paste them into `backend/.env`:

```bash
# JWT_SECRET and JWT_REFRESH_SECRET (run twice, use different values)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (must be exactly 32 bytes / 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Purpose |
|----------|---------|
| `PORT` | Backend HTTP/WS port (default `3001`) |
| `NODE_ENV` | Set to `production` for prod (secure cookies, same-origin CORS) |
| `JWT_SECRET` | Signs short-lived access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (use a *different* value) |
| `ENCRYPTION_KEY` | AES-256 key for SSH secrets — **64 hex chars exactly** |
| `DB_PATH` | SQLite file path (default `./data/panel.db`) |
| `LOGS_DIR` | Where cron job logs are written (default `./logs`) |
| `ADGUARD_URL` | *(optional)* AdGuard Home base URL — leave unset to disable the integration |
| `ADGUARD_USERNAME` / `ADGUARD_PASSWORD` | *(optional)* AdGuard Home basic-auth credentials |

> Changing `ENCRYPTION_KEY` later makes existing stored SSH secrets undecryptable.

---

## Run (development)

Two hot-reloading dev servers. From the project root:

```bash
npm run dev
```

| Service | URL | Notes |
|---------|-----|-------|
| Frontend (Vite) | http://localhost:5173 | Proxies `/api` and `/ws` to the backend |
| Backend (API + WS) | http://localhost:3001 | REST + WebSocket terminal |

Or run them in separate terminals:

```bash
npm run dev:backend     # http://localhost:3001
npm run dev:frontend    # http://localhost:5173
```

**First launch:** open http://localhost:5173, click **Initial setup**, and create
the first admin account (the setup route is disabled once a user exists).

You can also manage users from the CLI (see [backend/README](backend/README.md)):

```bash
npm run user --prefix backend -- list
npm run user --prefix backend -- passwd <username> <newPassword>
```

---

## Build & run (production)

```bash
# 1. Build frontend (-> frontend/dist) and compile backend (-> backend/dist).
#    The backend build also copies db/schema.sql into dist so the server can
#    initialise the database when run from compiled output.
npm run build

# 2. Set NODE_ENV=production in backend/.env, then start
npm start
```

In production the backend serves the built frontend itself, so the **whole app
is available on http://localhost:3001** (no separate Vite server).

### Optional: keep it running with PM2

```bash
cd backend
pm2 start dist/index.js --name network-panel
pm2 save
```

---

## Stop

| Situation | How |
|-----------|-----|
| Dev servers (foreground) | Press **Ctrl+C** in the terminal running `npm run dev` |
| Stray Node processes (Windows) | `taskkill /IM node.exe /F` &nbsp;or&nbsp; PowerShell: `Get-Process node \| Stop-Process -Force` |
| Stray Node processes (Linux/macOS) | `pkill -f tsx` &nbsp;and/or&nbsp; `pkill node` |
| PM2 | `pm2 stop network-panel` (or `pm2 delete network-panel`) |

---

## API reference

All routes are under `/api`. Every route except `/api/auth/*` requires a valid
access token (`Authorization: Bearer <token>`). The **Perm** column shows the
permission required beyond being logged in (admins bypass all checks).

### Auth — `/api/auth` (public)
| Method | Path | Perm | Notes |
|--------|------|------|-------|
| POST | `/login` | — | `{ username, password }` → `{ accessToken, user }` (refresh token set as an httpOnly cookie) |
| POST | `/refresh` | — | Rotates the refresh token cookie → `{ accessToken, user }` |
| POST | `/logout` | *(auth)* | Revokes the current refresh token |
| POST | `/setup` | — | Creates the first admin; disabled once any user exists |

### Devices — `/api/devices`
| Method | Path | Perm |
|--------|------|------|
| GET | `/` | *(auth)* |
| POST | `/` | `manage_devices` |
| GET | `/:id` | *(auth)* |
| PUT | `/:id` | `manage_devices` |
| DELETE | `/:id` | `manage_devices` |
| GET | `/:id/credentials` | *(auth)* |
| POST | `/:id/credentials` | `manage_devices` |
| DELETE | `/:id/credentials/:credId` | `manage_devices` |

### Power — `/api/devices/:id/power`
| Method | Path | Perm | Body |
|--------|------|------|------|
| POST | `/` | `power` | `{ action: 'shutdown'\|'reboot'\|'wake', delay?, credentialId? }` |

### System info — `/api/devices/:id/info`
| Method | Path | Perm | Query |
|--------|------|------|-------|
| GET | `/` | *(auth)* | `?type=basic\|cpu\|ram\|gpu\|processes\|docker` |

### Files (SFTP) — `/api/devices/:id/files`
| Method | Path | Perm | Notes |
|--------|------|------|-------|
| GET | `/` | `files` | `?path=` — list a directory |
| GET | `/content` | `files` | `?path=` — read a file |
| POST | `/upload` | `files` | multipart `file` field, `.zip` only |

### Commands — `/api/commands`
| Method | Path | Perm |
|--------|------|------|
| GET | `/` | *(auth)* |
| POST | `/` | `commands` |
| DELETE | `/:id` | `commands` |
| POST | `/:id/run` | `commands` — `{ deviceId, credentialId }` |

### Cron — `/api/cron`
| Method | Path | Perm |
|--------|------|------|
| GET | `/` | *(auth)* |
| POST | `/` | `cron` |
| PUT | `/:id` | `cron` |
| DELETE | `/:id` | `cron` |
| GET | `/:id/logs` | *(auth)* |

### Users — `/api/users` (all require `manage_users`)
| Method | Path |
|--------|------|
| GET | `/permissions` — list of permission keys |
| GET | `/` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |

### Network discovery — `/api/discover` (`manage_devices`)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Ping-sweep + ARP → `{ hosts: [{ ip, mac }] }` |

### Domains & DNS — `/api/domains`
Mounted behind `domains`; routes marked **`manage_domains`** additionally require
the full-manager permission. Scoped `domains` users only see/act on domains
assigned to them (or that they self-onboarded).

| Method | Path | Perm | Notes |
|--------|------|------|-------|
| GET | `/config` | `manage_domains` | BIND server + paths + nameservers + self-service flag |
| PUT | `/config` | `manage_domains` | Update DNS settings |
| GET | `/nameservers` | `domains` | Configured NS + whether self-service is on |
| GET | `/assignable-users` | `manage_domains` | Non-admin users that can be assigned domains |
| GET | `/preview` | `manage_domains` | Rendered `named.conf` include + all zone files |
| POST | `/apply` | `manage_domains` | Push **all** zones to BIND + run reload hook |
| GET | `/` | `domains` | List domains (all for managers, assigned for scoped) |
| POST | `/` | `domains` | Create; scoped users self-onboard via NS delegation (if enabled) |
| DELETE | `/:id` | `domains` | Owner or manager |
| GET | `/:id/users` | `manage_domains` | Users assigned to a domain |
| PUT | `/:id/users` | `manage_domains` | Set the assigned users (`{ userIds: [] }`) |
| GET | `/:id/records` | `domains` | List records |
| POST | `/:id/records` | `domains` | Add a record |
| PUT | `/:id/records/:rid` | `domains` | Update a record |
| DELETE | `/:id/records/:rid` | `domains` | Delete a record |
| POST | `/:id/verify` | `domains` | Start a TXT ownership challenge |
| POST | `/:id/verify/check` | `domains` | Check the challenge via DNS |
| POST | `/:id/apply` | `domains` | Push **one** domain's zone to BIND + reload |

### AdGuard Home — `/api/adguard` (`manage_domains`)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/status` | Read-only status + stats (`{ configured:false }` if `ADGUARD_URL` unset) |

### WebSocket
| Path | Perm | Notes |
|------|------|-------|
| `/ws/terminal?deviceId=&credentialId=&token=` | `terminal` | Interactive SSH shell (token is the access JWT) |

---

## Frontend pages

| Route | Page | Visible when |
|-------|------|--------------|
| `/login` | Sign in | — |
| `/setup` | Create the first admin | Only before any user exists |
| `/` | **Overview** — stat cards + recent cron runs | Always |
| `/devices` | **Devices** grid (add / scan / delete) | Always |
| `/devices/:id` | **Device** — power, system-info tabs, files, credentials | Always |
| `/devices/:id/terminal` | **SSH terminal** (xterm.js) | `terminal` |
| `/commands` | **Commands** library | `commands` |
| `/cron` | **Cron jobs** | `cron` |
| `/domains` | **Domains & DNS** (records, DNS settings, preview, apply, assignments) | `domains` |
| `/integrations` | **Integrations** — AdGuard Home status | `manage_domains` |
| `/users` | **Users** & permissions | `manage_users` |

The sidebar collapses into a hamburger drawer below the `md` breakpoint, so the
whole panel is usable on phones.

---

## Project layout

```
localNetworkPanel/
├── backend/          # Express API + WebSocket terminal + cron runner
│   ├── src/
│   │   ├── lib/      # Helpers: errors, http (asyncHandler/parseBody), sql, os-commands, net, permissions
│   │   ├── routes/   # Thin REST controllers (auth, devices, power, info, files,
│   │   │             #   commands, cron, users, discover, domains, adguard)
│   │   ├── services/ # ssh, crypto, auth, cron, wol, discovery, bind, verify, adguard
│   │   ├── ws/       # SSH terminal WebSocket handler
│   │   ├── cli/      # `npm run user` — manage panel users from the terminal
│   │   └── db/       # schema.sql + libsql client + migrate/reset
│   └── .env          # Secrets (not committed)
└── frontend/         # React + Vite SPA
    └── src/
        ├── components/ui/  # Shared widgets: Modal, Button, Field, Alert, inputs
        ├── components/     # DeviceSelect, CredentialSelect, InfoPanel, FilesBrowser, AddDeviceModal, …
        ├── hooks/          # useDevices, useDevice, useCredentials
        ├── lib/            # format, base64, permissions (can/useCan)
        ├── pages/          # Route screens (see table above)
        ├── api/            # Typed API client per resource
        └── store/          # Zustand auth store
```

---

## Useful commands

```bash
# Type-check (no emit)
npm run typecheck --prefix backend
npm run typecheck --prefix frontend

# Manage panel users from the CLI
npm run user --prefix backend -- <list|create|passwd|rename|set-role|delete> [args]

# Reset the database (dev only — wipes all data)
npm run db:reset --prefix backend

# Package the source into a .zip (excludes node_modules, dist, data, logs, .env)
powershell -File ./create-archive.ps1            # writes to the parent folder
powershell -File ./create-archive.ps1 -OutDir C:\Temp
```

---

## Security notes

- SSH passwords and private keys are AES-256-GCM encrypted before being stored,
  using `ENCRYPTION_KEY`. They are only decrypted in memory to open a connection.
- Refresh tokens are stored server-side and rotated on every refresh, so logout
  and revocation actually invalidate a session.
- API routes are permission-gated and, for DNS, ownership-scoped — a scoped
  `domains` user can only touch domains assigned to them.
- This panel grants real shell access to your machines — run it on a trusted
  network and put it behind HTTPS (set `NODE_ENV=production` so cookies are `secure`).

# TODO

- Add "copy credentials from another server" button, only to admins
- Allow to change path in file manage
- Keep sftp connection for 30s after last directory check or file edit/upload. Needed to reduce time of loading
- Allow editing and creating files
  -  Add permission `File edit`,`File create/delete` (also includes uploading)
- Hide scroll bar in terminal gui by changing size of terminal
- Change terminal size (remote size) so it would fit in terminal gui panel
- after apply: add close btn for success/fail
- DNS verify, save verify key per domain, so it wouldnt be different
- [BUG]: When openning раздел in a new tab panel by force removes your session (force log-out)