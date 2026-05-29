/**
 * routes/v1/users.js
 * ------------------
 * User management endpoints
 *
 * GET    /v1/users           → list users (admin) with pagination + filtering
 * GET    /v1/users/:id       → get single user
 * PATCH  /v1/users/:id       → partial update (not PUT — avoids overwrite risk)
 * DELETE /v1/users/:id       → soft delete
 *
 * Design decisions:
 * - PATCH not PUT (safer partial update)
 * - Cursor-based pagination (not offset — safe for large datasets)
 * - Consistent meta block on list responses
 * - 404 if user not found, 403 if not authorized to view
 */

const express  = require('express');
const { query }    = require('../../db');
const { ok, noContent, errors } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const logger   = require('../../utils/logger');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// ── Validation schemas ────────────────────────────────────────────────────────
const listSchema = {
  limit:  { type: 'integer', min: 1, max: 100, default: 20, source: 'query' },
  cursor: { type: 'string',  source: 'query' },
  role:   { type: 'enum', values: ['user', 'admin'], source: 'query' },
};

const updateSchema = {
  email:     { type: 'email' },
  full_name: { type: 'string', max: 255 },
};

const idSchema = {
  id: { type: 'uuid', required: true, source: 'params' },
};

// ── GET /v1/users ─────────────────────────────────────────────────────────────
router.get(
  '/',
  authorize('admin'),
  validate(listSchema),
  async (req, res, next) => {
    const { limit, cursor, role } = req.validated;
    try {
      // Cursor-based pagination — safe for live datasets
      const conditions = ['deleted_at IS NULL'];
      const params = [];

      if (cursor) {
        params.push(cursor);
        conditions.push(`id < $${params.length}`);
      }
      if (role) {
        params.push(role);
        conditions.push(`role = $${params.length}`);
      }

      params.push(limit + 1); // fetch one extra to detect next page
      const where = conditions.join(' AND ');

      const result = await query(
        `SELECT id, email, role, created_at, last_login_at
         FROM users
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params
      );

      const users    = result.rows.slice(0, limit);
      const hasMore  = result.rows.length > limit;
      const nextCursor = hasMore ? users[users.length - 1].id : null;

      return ok(res, { users }, {
        count:       users.length,
        has_more:    hasMore,
        next_cursor: nextCursor,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /v1/users/:id ─────────────────────────────────────────────────────────
router.get(
  '/:id',
  validate(idSchema),
  async (req, res, next) => {
    const { id } = req.validated;
    // Users can only view themselves unless admin
    if (req.user.role !== 'admin' && req.user.userId !== id) {
      return errors.forbidden(res, 'You can only view your own profile');
    }
    try {
      const result = await query(
        `SELECT id, email, role, created_at, last_login_at
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (!result.rows[0]) return errors.notFound(res, 'User');
      return ok(res, { user: result.rows[0] });
    } catch (err) { next(err); }
  }
);

// ── PATCH /v1/users/:id ───────────────────────────────────────────────────────
router.patch(
  '/:id',
  validate({ ...idSchema, ...updateSchema }),
  async (req, res, next) => {
    const { id, email, full_name } = req.validated;
    if (req.user.role !== 'admin' && req.user.userId !== id) {
      return errors.forbidden(res, 'You can only update your own profile');
    }

    // Build dynamic update — only set fields that were provided
    const updates = [];
    const params  = [];

    if (email) {
      params.push(email.toLowerCase());
      updates.push(`email = $${params.length}`);
    }
    if (full_name) {
      params.push(full_name);
      updates.push(`full_name = $${params.length}`);
    }

    if (updates.length === 0) {
      return errors.badRequest(res, 'No updatable fields provided');
    }

    params.push(new Date());
    updates.push(`updated_at = $${params.length}`);
    params.push(id);

    try {
      const result = await query(
        `UPDATE users SET ${updates.join(', ')}
         WHERE id = $${params.length} AND deleted_at IS NULL
         RETURNING id, email, role, created_at`,
        params
      );
      if (!result.rows[0]) return errors.notFound(res, 'User');
      logger.info('user.updated', { userId: id, by: req.user.userId });
      return ok(res, { user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return errors.conflict(res, 'Email already in use');
      next(err);
    }
  }
);

// ── DELETE /v1/users/:id ──────────────────────────────────────────────────────
router.delete(
  '/:id',
  authorize('admin'),
  validate(idSchema),
  async (req, res, next) => {
    const { id } = req.validated;
    try {
      const result = await query(
        `UPDATE users SET deleted_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [id]
      );
      if (!result.rows[0]) return errors.notFound(res, 'User');
      logger.info('user.deleted', { userId: id, by: req.user.userId });
      return noContent(res);
    } catch (err) { next(err); }
  }
);

module.exports = router;
