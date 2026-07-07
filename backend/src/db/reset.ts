import 'dotenv/config';
import fs from 'fs';
import { initSchema } from './db';

const DB_PATH = process.env.DB_PATH ?? './data/panel.db';
if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); console.log('DB deleted'); }
initSchema()
  .then(() => { console.log('DB recreated'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
