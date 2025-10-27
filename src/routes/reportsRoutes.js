const express = require('express');

const router = express.Router();
const { 
    getAuditLogReport,
    getWeeklyReportForUser,
    getMonthlyReportForUser
} = require('../controllers/reportsController');

const { protect , adminOnly} = require('../middleware/auth');

router.use(protect)

// GET /api/reports/audit?startDate=...&endDate=...
router.get('/audit',adminOnly, getAuditLogReport);

// GET /api/reports/weekly/5
router.get('/weekly/:userId',adminOnly, getWeeklyReportForUser);

// GET /api/reports/monthly/5
router.get('/monthly/:userId', adminOnly, getMonthlyReportForUser);

module.exports = router;