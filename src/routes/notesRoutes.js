const express = require('express');
const {
  getNotes,
  getTrash,
  createNote,
  deleteNote,
  restoreNote,
  permanentDeleteNote,
  getAttachments,
  downloadAttachment,
  deleteAttachment,
  getStats,
  getSingleNote,
  updateNote,
  getTags
} = require('../controllers/notesController');
const { validate } = require('../middleware/validate');
const { protect, checkNotePermission } = require('../middleware/auth');
const { cache } = require('../middleware/cache');
const { excludeDeleted } = require('../middleware/softDelete');
const auditLog = require('../middleware/auditLog');
const upload = require('../config/multer');

const router = express.Router();

router.use(protect);


router.get('/tags', getTags);

// Stats
router.get('/stats', cache(300), getStats);

// Trash operations
router.get('/trash', getTrash);
router.post('/:id/restore', auditLog('RESTORE', 'Note'), restoreNote);
router.delete('/:id/permanent', auditLog('PERMANENT_DELETE', 'Note'), permanentDeleteNote);

// Attachments
router.get('/:id/attachments', checkNotePermission('read'), getAttachments);
router.get('/:id/attachments/:attachmentId/download', checkNotePermission('read'), downloadAttachment);
router.delete('/:id/attachments/:attachmentId', checkNotePermission('edit'), auditLog('DELETE_ATTACHMENT', 'Attachment'), deleteAttachment);

// CRUD with attachments
router.route('/')
  .get(excludeDeleted, cache(60), getNotes)
  .post(upload.array('attachments', 5), validate('note'), auditLog('CREATE', 'Note'), createNote);

router.route('/:id')
  .get(checkNotePermission('read'), getSingleNote) 
  .put(
  checkNotePermission('edit'),
  upload.array('attachments', 5), // Handles new file uploads
  validate('note'), // Validates the body
  auditLog('UPDATE', 'Note'),
  updateNote 
 )
  .delete(checkNotePermission('edit'), auditLog('DELETE', 'Note'), deleteNote);
module.exports = router;