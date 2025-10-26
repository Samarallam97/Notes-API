const express = require('express');
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoriesController');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getCategories)
  .post(validate('category'), createCategory);

router.route('/:id')
  .put(validate('category'), updateCategory)
  .delete(deleteCategory);

module.exports = router;