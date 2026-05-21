const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getMe, getAllUsers, deleteUser } = require('../controllers/userController');

const router = express.Router();

router.get('/me', authenticate, getMe);
router.get('/', authenticate, authorize('admin'), getAllUsers);
router.delete('/:id', authenticate, authorize('admin'), deleteUser);

module.exports = router;
