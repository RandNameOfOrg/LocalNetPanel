PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS panel_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,       -- bcrypt hash
  role        TEXT NOT NULL DEFAULT 'user', -- 'admin' | 'user'
  permissions TEXT,                -- JSON array of permission keys; ignored for admins (who have all)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES panel_users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS devices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  ip         TEXT NOT NULL,
  mac        TEXT,               -- for Wake-on-LAN
  os_type    TEXT NOT NULL DEFAULT 'linux', -- 'linux' | 'windows'
  port       INTEGER NOT NULL DEFAULT 22,
  notes      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS device_credentials (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,                  -- display name, e.g. "root", "deploy user"
  username     TEXT NOT NULL,
  auth_type    TEXT NOT NULL DEFAULT 'password', -- 'password' | 'key'
  secret       TEXT,                           -- AES-encrypted password or private key PEM
  passphrase   TEXT,                           -- AES-encrypted key passphrase (if any)
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS saved_commands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  command     TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS cron_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  schedule    TEXT NOT NULL,     -- cron expression e.g. "*/5 * * * *"
  device_id   INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  credential_id INTEGER REFERENCES device_credentials(id) ON DELETE SET NULL,
  command     TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run    INTEGER,
  last_status TEXT,              -- 'success' | 'error'
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Single-row config (id always 1) for the BIND/DNS server the panel manages.
CREATE TABLE IF NOT EXISTS dns_config (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  device_id     INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  credential_id INTEGER REFERENCES device_credentials(id) ON DELETE SET NULL,
  include_path  TEXT NOT NULL DEFAULT '/etc/bind/automated.domains',
  zones_dir     TEXT NOT NULL DEFAULT '/etc/bind/zones',
  reload_hook   TEXT NOT NULL DEFAULT 'sudo rndc reload',
  nameservers   TEXT NOT NULL DEFAULT '', -- authoritative NS hostnames, one per line; applied to every zone
  allow_self_service INTEGER NOT NULL DEFAULT 0, -- let scoped 'domains' users self-onboard via NS delegation
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS domains (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,        -- e.g. example.com
  ttl           INTEGER NOT NULL DEFAULT 3600,
  primary_ns    TEXT NOT NULL DEFAULT 'ns1', -- SOA MNAME (relative to domain unless it contains a dot)
  admin_email   TEXT NOT NULL DEFAULT 'admin',
  verified      INTEGER NOT NULL DEFAULT 0,
  verify_token  TEXT,                        -- token to publish for ownership check
  verify_method TEXT,                        -- 'bind' | 'external'
  verified_at   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Maps which non-admin panel users may manage which domains (scoped 'domains' permission).
CREATE TABLE IF NOT EXISTS domain_users (
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES panel_users(id) ON DELETE CASCADE,
  PRIMARY KEY (domain_id, user_id)
);

CREATE TABLE IF NOT EXISTS dns_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id  INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,         -- relative to zone, '@' for apex
  type       TEXT NOT NULL,         -- A | AAAA | CNAME | TXT | MX | SRV | NS
  value      TEXT NOT NULL,         -- rdata / target
  ttl        INTEGER,               -- optional per-record TTL
  priority   INTEGER,               -- MX / SRV
  weight     INTEGER,               -- SRV
  port       INTEGER,               -- SRV
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
