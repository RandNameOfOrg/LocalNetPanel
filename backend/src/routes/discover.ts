import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { discoverHosts } from '../services/discovery.service';

const router = Router();

// GET /api/discover — scan local subnets for hosts (IP + MAC) for Wake-on-LAN setup.
router.get('/', asyncHandler(async (_req, res) => {
  res.json({ hosts: await discoverHosts() });
}));

export default router;
