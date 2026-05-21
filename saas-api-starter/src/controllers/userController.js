const { query } = require('../db');

const getMe = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, role, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    res.json({ users: result.rows, total: result.rowCount });
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    await query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMe, getAllUsers, deleteUser };
