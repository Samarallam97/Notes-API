const express = require('express');
const {
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote
} = require('../controllers/notesController');
const { validateNote } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected (require authentication)
router.use(protect);

router.route('/')
  .get(getNotes)
  .post(validateNote, createNote);

router.route('/:id')
  .get(getNote)
  .put(validateNote, updateNote)
  .delete(deleteNote);

module.exports = router;