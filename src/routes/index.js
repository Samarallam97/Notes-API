const express = require('express');
const authRoutes = require('./authRoutes');
const notesRoutes = require('./notesRoutes');
const categoriesRoutes = require('./categoriesRoutes');
const sharingRoutes = require('./sharingRoutes');
const templatesRoutes = require('./templatesRoutes');
const exportRoutes = require('./exportRoutes');
const reportsRoutes = require('./reportsRoutes');


const router = express.Router();

router.use('/auth', authRoutes);
router.use('/notes', notesRoutes);
router.use('/categories', categoriesRoutes);
router.use('/sharing', sharingRoutes);
router.use('/templates', templatesRoutes);
router.use('/export', exportRoutes);
router.use('/reports', reportsRoutes);


module.exports = router;