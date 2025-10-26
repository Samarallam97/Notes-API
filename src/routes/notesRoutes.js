const express = require('express');
const {
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  getTags,
  getStats
} = require('../controllers/notesController');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Special routes
router.get('/tags', getTags);
router.get('/stats', getStats);

// CRUD routes
router.route('/')
  .get(getNotes)
  .post(validate('note'), createNote);

router.route('/:id')
  .get(getNote)
  .put(validate('note'), updateNote)
  .delete(deleteNote);

module.exports = router;