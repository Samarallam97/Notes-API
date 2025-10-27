const express = require('express');
const {
  shareNote,
  getSharedUsers,
  getSharedWithMe,
  revokeShare
} = require('../controllers/sharingController');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

const router = express.Router();

router.use(protect);

router.get('/shared-with-me', getSharedWithMe);
router.post('/notes/:id/share', validate('shareNote'), auditLog('SHARE', 'Note'), shareNote);
router.get('/notes/:id/users', getSharedUsers);
router.delete('/:shareId', auditLog('REVOKE_SHARE', 'SharedNote'), revokeShare);

module.exports = router;