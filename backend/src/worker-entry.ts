import 'dotenv/config';
import { WorkerManager } from './worker/WorkerManager';
import logger from './utils/logger';

async function main() {
  const manager = new WorkerManager();
  try {
    await manager.start();
  } catch (err) {
    logger.error('Failed to start worker', { error: String(err) });
    process.exit(1);
  }
}

main();
