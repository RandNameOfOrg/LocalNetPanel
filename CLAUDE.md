# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Local Network Device Management Panel** — a web application for managing devices on a local network via SSH, with a React frontend and Node.js/Express backend.

## Commands

### Development
```bash
# Install all dependencies (use --registry https://registry.npmjs.org on JLL machines)
npm install --registry https://registry.npmjs.org
npm install --registry https://registry.npmjs.org --prefix backend
npm install --registry https://registry.npmjs.org --prefix frontend

# Start backend (port 3001) — Windows: uses tsx.cmd, Linux: tsx works directly
cd backend && npm run dev

# Start frontend (port 5173, proxied to backend)
cd frontend && npm run dev
```

> **Note:** `better-sqlite3` was replaced with `@libsql/client` (pure WASM) to avoid native compilation. Backend requires `backend/.env` — copy from `.env.example` and generate real keys.

> **Windows:** npm `dev` script uses `node node_modules/.bin/tsx.cmd`. On Linux change it back to `tsx watch src/index.ts`.

### Build & Production
```bash
# Build everything: frontend -> frontend/dist, backend -> backend/dist
# (the backend build also copies db/schema.sql into dist/db)
npm run build

# Start backend in production (serves the built frontend from ../frontend/dist)
cd backend && npm start

# With PM2
cd backend && pm2 start dist/index.js --name network-panel
```

> Full, up-to-date API route map and page list live in [README.md](README.md).

### Database
```bash
# Run migrations (creates/updates SQLite schema)
cd backend && npm run db:migrate

# Reset DB (dev only)
cd backend && npm run db:reset
```

### Linting & Type Checking
```bash
cd backend && npm run lint && npm run typecheck
cd frontend && npm run lint && npm run typecheck
```

## Architecture

```
localNetworkPanel/
├── backend/               # Express + TypeScript API server
│   ├── src/
│   │   ├── lib/          # Cross-cutting helpers (errors, http, sql, os-commands)
│   │   ├── routes/        # Express route handlers (thin controllers)
│   │   ├── services/      # Business logic (ssh, crypto, auth, cron, wol)
│   │   ├── ws/            # WebSocket handlers (SSH terminal)
│   │   ├── db/            # SQLite schema + libsql client + query helpers
│   │   ├── middleware/     # Auth JWT check
│   │   └── index.ts       # App entry: Express + WS server + global error handler
│   ├── data/              # SQLite DB file (gitignored)
│   ├── logs/              # Cron job output files
│   └── .env               # ENCRYPTION_KEY, JWT_SECRET, PORT
└── frontend/              # React + Vite + TypeScript + TailwindCSS
    └── src/
        ├── pages/         # Route-level components (Dashboard, Device, Terminal, etc.)
        ├── components/    # Feature components + ui/ (shared widgets)
        ├── hooks/         # Shared React Query hooks (useDevices, useCredentials)
        ├── lib/           # format (bytes/timestamps), base64 (terminal encoding)
        ├── api/           # Typed fetch wrappers for each API resource
        └── store/         # Zustand stores (auth)
```

### Shared helpers & conventions (reuse these — don't re-implement)

**Backend (`src/lib/`, `src/services/`):**
- `asyncHandler(fn)` wraps every route; handlers **throw** `AppError` (or `badRequest`/`notFound`/…) instead of writing error responses. `errorHandler` in `index.ts` formats them.
- `parseBody(zodSchema, req.body)` validates input; `intParam(req, 'id')` / `requireIntQuery(req, name)` read params.
- `buildUpdate(obj)` builds partial `UPDATE` SET clauses; `nowSeconds()` for timestamps.
- `withSSH(device, cred, fn)` / `withSFTP(...)` open and auto-close connections; `runCommand(...)` for one-shot exec.
- `auth.service.ts` owns token logic: `rotateRefreshToken`, `revokeRefreshToken`, `signAccessToken`, `publicUser`.
- `os-commands.ts` owns all Linux/Windows command strings: `powerCommand(...)`, `infoCommand(...)`.

**Frontend (`src/components/ui/`, `src/hooks/`, `src/lib/`):**
- Widgets: `Button` (variant/size), `Modal`, `Field`, `Alert`, and `TextInput`/`Select`/`Textarea` (`inputs.tsx`). Use these instead of restyling raw elements.
- `DeviceSelect` / `CredentialSelect` for the device + user pickers.
- Hooks `useDevices` / `useDevice` / `useCredentials` wrap the shared React Query keys.
- `lib/format.ts` (`formatBytes`, `formatTimestamp`), `lib/base64.ts` (browser-safe terminal encoding — **no Node `Buffer` on the frontend**).

## Key Design Decisions

### SSH Terminal (WebSocket)
- Browser connects via WebSocket to `ws://backend/ws/terminal?deviceId=X&credentialId=Y`
- Backend creates an `ssh2` connection to the target device on WS connect
- Data flows: `xterm.js → WS → backend → SSH channel → device`, and back
- One `ssh2` client per WebSocket connection, closed when the socket closes (see `ws/terminal.ts`)
- Frontend uses `xterm.js` + `xterm-addon-fit` for the terminal UI

### Credential Encryption
- All SSH passwords and private key content are encrypted with **AES-256-GCM** before storing in SQLite
- Encryption key comes from `ENCRYPTION_KEY` env var (32-byte hex string)
- Service: `backend/src/services/crypto.service.ts` — `encrypt(plaintext)` / `decrypt(ciphertext)`
- Private key files are never written to disk; stored as encrypted blobs in DB

### Database (SQLite via `@libsql/client`)
Schema tables:
- `panel_users` — panel login accounts (hashed passwords, roles)
- `devices` — device registry (name, ip, mac, os type, notes)
- `device_credentials` — SSH users per device (username, encrypted password or private key, auth type)
- `saved_commands` — user-defined command library (name, command, device scope)
- `cron_jobs` — scheduled tasks (schedule expr, command, device_id, last_run, output_file)
- `refresh_tokens` — JWT refresh token store for revocation

### Power Management
- Linux: `shutdown -h now` / `reboot` / `shutdown -h +N` (minutes)
- Windows: `shutdown /s /t 0` / `shutdown /r /t 0` / `shutdown /s /t N` (seconds)
- Delayed shutdown default: 0 (immediate)
- Executed via SSH using device's saved credentials

### Wake-on-LAN
- Backend sends UDP magic packet to device's MAC address using `wake_on_lan` package
- Device must be reachable via broadcast on the same subnet as the backend server

### System Info Collection
All info gathered via SSH commands, returned as structured JSON:
- Network: `ip addr show` / `ipconfig` (Windows)
- Uptime: `uptime -p` / `(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime`
- CPU/RAM: `top -bn1` + `free -m` / `Get-WmiObject Win32_Processor`
- GPU: `nvidia-smi --query-gpu=... --format=csv` (optional, graceful fallback)
- Processes: `ps aux --sort=-%cpu | head -20`
- Docker: `docker ps --format json` (if docker available)

### Auth Flow
- POST `/api/auth/login` → returns `{ accessToken, refreshToken }`
- Access token: 15min JWT, sent in `Authorization: Bearer` header
- Refresh token: 7-day, stored in DB + httpOnly cookie
- POST `/api/auth/refresh` → rotates refresh token
- All API routes except `/auth/*` require valid access token via `authMiddleware`

### Cron Jobs
- Stored in `cron_jobs` table with a cron expression (e.g. `*/5 * * * *`)
- `node-cron` schedules are loaded on backend startup and re-synced when jobs are created/deleted
- Output appended to `backend/logs/<job_id>.log` with timestamps
- Service: `backend/src/services/cron.service.ts`

### File Browser (SFTP)
- Separate REST endpoints: `GET /api/devices/:id/files?path=/` lists directory, `GET /api/devices/:id/files/content?path=...` reads file
- Uses `ssh2`'s SFTP subsystem (same package as terminal)
- Read-only in v1; write support can be added later

## Key npm Packages

### Backend
- `express` + `cors` + `helmet` — HTTP server
- `ws` — WebSocket server for SSH terminal
- `ssh2` — SSH and SFTP client
- `@libsql/client` — SQLite driver (async, prebuilt — no native build step)
- `bcryptjs` — panel user password hashing
- `jsonwebtoken` — JWT sign/verify
- `node-cron` — cron scheduling
- `wake_on_lan` — WoL magic packets
- `zod` — request validation schemas

### Frontend
- `react` + `react-router-dom` v6 — SPA routing
- `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` — SSH terminal
- `tailwindcss` + `shadcn/ui` — UI components
- `zustand` — auth + device state
- `@tanstack/react-query` — server state, caching, background refresh
- `axios` — HTTP client with interceptors for token refresh

## Environment Variables (backend/.env)
```
PORT=3001
JWT_SECRET=<random 64-char hex>
JWT_REFRESH_SECRET=<different random 64-char hex>
ENCRYPTION_KEY=<random 32-byte hex for AES-256>
DB_PATH=./data/panel.db
LOGS_DIR=./logs
```

## API Route Map
```
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/devices
POST   /api/devices
GET    /api/devices/:id
PUT    /api/devices/:id
DELETE /api/devices/:id

GET    /api/devices/:id/credentials
POST   /api/devices/:id/credentials
DELETE /api/devices/:id/credentials/:credId

POST   /api/devices/:id/power        { action: 'shutdown'|'reboot'|'wake', delay?: number }
GET    /api/devices/:id/info         { type: 'basic'|'cpu'|'ram'|'gpu'|'processes'|'docker' }
GET    /api/devices/:id/files        ?path=/home/user
GET    /api/devices/:id/files/content?path=/etc/hosts

GET    /api/commands
POST   /api/commands
DELETE /api/commands/:id
POST   /api/commands/:id/run         { deviceId, credentialId }

GET    /api/cron
POST   /api/cron
PUT    /api/cron/:id
DELETE /api/cron/:id
GET    /api/cron/:id/logs

WS     /ws/terminal?deviceId=X&credentialId=Y&token=JWT
```
