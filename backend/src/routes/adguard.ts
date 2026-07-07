import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { getAdguardStatus } from '../services/adguard.service';

const router = Router();

// GET /api/adguard/status — read-only AdGuardHome status (no-op result if not configured).
router.get('/status', asyncHandler(async (_req, res) => {
  res.json(await getAdguardStatus());
}));

export default router;
