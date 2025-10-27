const express = require('express');
const {
  getTemplates,
  createTemplate,
  useTemplate,
  deleteTemplate
} = require('../controllers/templatesController');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getTemplates)
  .post(validate('template'), createTemplate);

router.post('/:templateId/use', useTemplate);
router.delete('/:templateId', deleteTemplate);

module.exports = router;