import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { getDeviceAndCred, withSFTP } from '../services/ssh.service';
import { asyncHandler, intParam, requireIntQuery } from '../lib/http';
import { badRequest } from '../lib/errors';

const router = Router({ mergeParams: true });

// Uploads are buffered in memory then streamed to the device over SFTP.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/', asyncHandler(async (req, res) => {
  const credentialId = requireIntQuery(req, 'credentialId');
  const remotePath = (req.query.path as string) ?? '/';
  const { device, cred } = await getDeviceAndCred(intParam(req), credentialId);

  const entries = await withSFTP(device, cred, sftp =>
    new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) return reject(err);
        resolve(list.map(f => ({
          name: f.filename,
          type: f.attrs.isDirectory() ? 'directory' : 'file',
          size: f.attrs.size,
          mtime: f.attrs.mtime,
        })));
      });
    }),
  );
  res.json({ path: remotePath, entries });
}));

router.get('/content', asyncHandler(async (req, res) => {
  const credentialId = requireIntQuery(req, 'credentialId');
  const remotePath = req.query.path as string;
  if (!remotePath) throw badRequest('path query param is required');
  const { device, cred } = await getDeviceAndCred(intParam(req), credentialId);

  const content = await withSFTP(device, cred, sftp =>
    new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on('data', (d: Buffer) => chunks.push(d));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    }),
  );
  res.json({ path: remotePath, content });
}));

// POST /upload?path=<dir>&credentialId=<id>  (multipart field: "file") — .zip only.
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const credentialId = requireIntQuery(req, 'credentialId');
  const dir = (req.query.path as string) ?? '.';
  const file = req.file;
  if (!file) throw badRequest('No file uploaded (field "file")');
  if (!file.originalname.toLowerCase().endsWith('.zip')) throw badRequest('Only .zip files are allowed');

  const { device, cred } = await getDeviceAndCred(intParam(req), credentialId);
  const safeName = path.basename(file.originalname);
  const remotePath = `${dir.replace(/\/+$/, '')}/${safeName}`;

  await withSFTP(device, cred, sftp =>
    new Promise<void>((resolve, reject) => {
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', () => resolve());
      ws.on('error', reject);
      ws.end(file.buffer);
    }),
  );
  res.status(201).json({ ok: true, path: remotePath, size: file.size });
}));

export default router;
