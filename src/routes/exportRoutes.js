const express = require('express');
const {
  exportNotePDF,
  exportAllNotesPDF,
  exportJSON,
  exportCSV,
  importJSON
} = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(protect);

router.get('/notes/:id/pdf', exportNotePDF);
router.get('/notes/pdf', exportAllNotesPDF);
router.get('/notes/json', exportJSON);
router.get('/notes/csv', exportCSV);
router.post('/notes/import', uploadLimiter, importJSON);

module.exports = router;