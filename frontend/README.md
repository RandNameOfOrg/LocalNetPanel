# Frontend — Local Network Panel

React + Vite + TypeScript SPA, styled with TailwindCSS. Talks to the backend
over REST and opens the SSH terminal over a WebSocket. The layout is responsive
— the sidebar becomes a hamburger drawer on small screens.

See the [root README](../README.md) for full setup and the API reference; this
file is a quick reference for working inside `frontend/`.

## Setup

```bash
npm install
```

The dev server proxies `/api` and `/ws` to the backend on port 3001
(see [`vite.config.ts`](vite.config.ts)), so **start the backend too**.

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start Vite dev server on <http://localhost:5173> |
| `npm run build` | Type-check (`tsc`) then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without emitting |

> In production the built `dist/` is served by the backend, so the whole app
> runs on port 3001. `npm run preview` is only for checking the build in isolation.

## Stop

Press **Ctrl+C** in the terminal running `npm run dev`.

## Pages (routes)

Defined in [`src/App.tsx`](src/App.tsx). Routes marked with a permission are
wrapped in `RequirePermission`; the sidebar hides links the user can't use.

| Route | Page file | Permission |
|-------|-----------|------------|
| `/login` | `pages/Login.tsx` | — |
| `/setup` | `pages/Setup.tsx` | — (first-run only) |
| `/` | `pages/Overview.tsx` | — |
| `/devices` | `pages/Dashboard.tsx` | — |
| `/devices/:id` | `pages/DevicePage.tsx` | — |
| `/devices/:id/terminal` | `pages/TerminalPage.tsx` | `terminal` |
| `/commands` | `pages/CommandsPage.tsx` | `commands` |
| `/cron` | `pages/CronPage.tsx` | `cron` |
| `/domains` | `pages/DomainsPage.tsx` | `domains` |
| `/integrations` | `pages/IntegrationsPage.tsx` | `manage_domains` |
| `/users` | `pages/UsersPage.tsx` | `manage_users` |

## Layout

```text
src/
├── App.tsx               # Routes + auth guard (RequireAuth / RequirePermission)
├── components/Layout.tsx # Responsive sidebar/drawer + nav (filtered by permission)
├── api/                  # axios client (token-refresh interceptor) + typed endpoints:
│   │                     #   devices, users, domains, adguard
├── store/auth.ts         # Zustand auth store (user persisted; access token in memory)
├── hooks/                # useDevices, useDevice, useCredentials (shared queries)
├── lib/
│   ├── format.ts         # bytes / timestamps
│   ├── base64.ts         # browser-safe terminal encoding (no Node Buffer)
│   └── permissions.ts    # PERMISSION_LABELS + can(user, perm) / useCan(perm)
├── components/
│   ├── ui/               # Reusable widgets: Modal, Button, Field, Alert, inputs
│   ├── DeviceSelect.tsx  # Device dropdown (uses useDevices)
│   ├── CredentialSelect.tsx
│   ├── AddDeviceModal.tsx# Add device (+ network scan, MAC validation)
│   ├── InfoPanel.tsx     # System-info tab
│   └── FilesBrowser.tsx  # SFTP browser + .zip upload
└── pages/                # Route screens (see table above)
```

## Conventions

- Reuse the `ui/` widgets (`Button`, `Field`, `Modal`, `Alert`, `TextInput`,
  `Select`, `Textarea`) instead of re-styling raw elements.
- Fetch shared data through the hooks in `hooks/` so React Query caches it once.
- Use `DeviceSelect` / `CredentialSelect` for the (very common) device + user pickers.
- Gate UI on permissions with `useCan('<perm>')`; keep the keys in sync with
  `backend/src/lib/permissions.ts`. `manage_domains` implies `domains`.
- Make new screens responsive: stack grids at small widths and avoid fixed
  widths that overflow a phone viewport.
```
