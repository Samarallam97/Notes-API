const express = require('express');
const { register, login, getMe ,createAdmin} = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { protect , rootAdminOnly} = require('../middleware/auth');

const router = express.Router();

router.post('/register', validate('register'), register);
router.post('/login', validate('login'), login);
router.get('/me', protect, getMe);
router.post(
 '/admin',
 protect,    
 rootAdminOnly,
 validate('register'),  
 createAdmin
);
module.exports = router;