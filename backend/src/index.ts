import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';

import authRouter from './routes/auth';
import devicesRouter from './routes/devices';
import powerRouter from './routes/power';
import infoRouter from './routes/info';
import filesRouter from './routes/files';
import commandsRouter from './routes/commands';
import cronRouter from './routes/cron';
import usersRouter from './routes/users';
import discoverRouter from './routes/discover';
import domainsRouter from './routes/domains';
import adguardRouter from './routes/adguard';
import { authMiddleware, requirePermission } from './middleware/auth.middleware';
import { attachTerminalWS } from './ws/terminal';
import { loadJobs } from './services/cron.service';
import { initSchema } from './db/db';
import { errorHandler } from './lib/http';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/devices', authMiddleware, devicesRouter);
app.use('/api/devices/:id/power', authMiddleware, requirePermission('power'), powerRouter);
app.use('/api/devices/:id/info', authMiddleware, infoRouter);
app.use('/api/devices/:id/files', authMiddleware, requirePermission('files'), filesRouter);
app.use('/api/commands', authMiddleware, commandsRouter);
app.use('/api/cron', authMiddleware, cronRouter);
app.use('/api/users', authMiddleware, requirePermission('manage_users'), usersRouter);
app.use('/api/discover', authMiddleware, requirePermission('manage_devices'), discoverRouter);
app.use('/api/domains', authMiddleware, requirePermission('domains'), domainsRouter);
app.use('/api/adguard', authMiddleware, requirePermission('manage_domains'), adguardRouter);

const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// Global error handler — must be registered after all routes.
app.use(errorHandler);

async function start() {
  await initSchema();
  await loadJobs();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });
  attachTerminalWS(wss);

  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`WS terminal: ws://localhost:${PORT}/ws/terminal`);
  });
}

start().catch(err => { console.error('Startup failed:', err); process.exit(1); });
