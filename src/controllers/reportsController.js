const fs = require('fs');
const path = require('path');
const { 
 generateAuditLogReport,
 generateWeeklySummaryReport,
 generateMonthlyAnalyticsReport 
} = require('../jobs/reportGenerator'); 

/**
 * @desc    Get an audit log report as a CSV file
 * @route   GET /api/reports/audit
 * @access  Private (Admin)
 */

exports.getAuditLogReport = async (req, res, next) => {
 const { startDate, endDate } = req.query;

 if (!startDate || !endDate) {
  return next();
 }

 let outputPath = null;

 try {
  outputPath = await generateAuditLogReport(startDate, endDate);
  
  // Send the file as a download
  res.download(outputPath, (err) => {
   if (err) {
    console.error('Error sending file to user:', err);
   }
   
   // Clean up the file from the server after it's sent
   fs.unlink(outputPath, (unlinkErr) => {
    if (unlinkErr) {
     console.error('Error deleting report file:', outputPath, unlinkErr);
    } else {
     console.log(`Successfully deleted report file: ${outputPath}`);
    }
   });
  });
 } catch (err) {
  // If the report generation fails, clean up any partial file
  if (outputPath) {
   fs.unlink(outputPath, () => {});
  }
  next(err);
 }
};

/**
 * @desc    Get a weekly summary report for a specific user
 * @route   GET /api/reports/weekly/:userId
 * @access  Private (Admin)
 */
exports.getWeeklyReportForUser = async (req, res, next) => {
 try {
  const { userId } = req.params;
  
  const report = await generateWeeklySummaryReport(userId);
  
  res.status(200).json({
   success: true,
   data: report
  });
  
 } catch (err) {
  next(err);
 }
};

/**
 * @desc    Get a monthly analytics report for a specific user
 * @route   GET /api/reports/monthly/:userId
 * @access  Private (Admin)
 */
exports.getMonthlyReportForUser = async (req, res, next) => {
 try {
  const { userId } = req.params;
  
  const report = await generateMonthlyAnalyticsReport(userId);
  
  res.status(200).json({
   success: true,
   data: report
  });
  
 } catch (err) {
  next(err);
 }
};