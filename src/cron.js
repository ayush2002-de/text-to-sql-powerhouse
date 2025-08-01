import cron from 'node-cron';
import { runQueryLogSync } from './scheduler/sync-query-logs.js';
import { runSchemaSync } from './scheduler/syncSchema.js';
import { createServiceLogger } from './config/logger.js';

const logger = createServiceLogger('CronScheduler');

// --- SCHEDULER ---
// This schedule runs the job at 2:00 AM every day.
cron.schedule('0 2 * * *', runQueryLogSync, {
  scheduled: true,
  timezone: 'Asia/Kolkata',
});

cron.schedule('0 2 * * *', runSchemaSync, {
  scheduled: true,
  timezone: 'Asia/Kolkata',
});

logger.info('Synchronization service started', {
  schedule: '0 2 * * *',
  timezone: 'Asia/Kolkata',
  service: 'SCHEMA_SYNC',
});

runQueryLogSync();
