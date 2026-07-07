import 'dotenv/config';
import { initSchema } from './db';

initSchema()
  .then(() => { console.log('Migration complete'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
