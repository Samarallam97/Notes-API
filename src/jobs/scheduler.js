const cron = require('node-cron');
const { scheduleWeeklyReports } = require('./reportGenerator');
const { cleanupTempFiles } = require('../utils/fileUpload');

/**
 * Initialize all scheduled jobs
 */
const initializeScheduler = () => {
  console.log('⏰ Initializing scheduled jobs...');

  // Weekly reports - Every Monday at 9:00 AM
  cron.schedule('0 9 * * 1', async () => {
    console.log('🔄 Running weekly reports job...');
    try {
      await scheduleWeeklyReports();
    } catch (err) {
      console.error('Weekly reports job failed:', err);
    }
  });

  // Cleanup temp files - Every day at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    console.log('🗑️ Running temp files cleanup...');
    try {
      cleanupTempFiles();
    } catch (err) {
      console.error('Cleanup job failed:', err);
    }
  });

  // Health check - Every 5 minutes (optional)
  cron.schedule('*/5 * * * *', () => {
    console.log('💓 Health check - System running normally');
  });

  console.log('✅ Scheduled jobs initialized');
};

module.exports = { initializeScheduler };