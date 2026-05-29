/**
 * routes/v1/auth.js
 * -----------------
 * Auth endpoints — versioned under /v1/auth
 *
 * POST /v1/auth/register    → create account + org
 * POST /v1/auth/login       → get token pair
 * POST /v1/auth/refresh     → rotate refresh token
 * POST /v1/auth/logout      → revoke refresh token
 * GET  /v1/auth/me          → current user profile
 *
 * Design decisions:
 * - All auth actions are POST (state-changing)
 * - GET /me lives here (not /users/me) — auth context
 * - Every response uses the same envelope via response.js
 * - Validation happens before controller via validate middleware
 * - Rate limiting is tighter on auth routes (10 req/15min)
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { query }    = require('../../db');
const { ok, created, errors } = require('../../utils/response');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const logger   = require('../../utils/logger');

const router = express.Router();

// ── Rate limiter for auth routes ──────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => errors.tooManyRequests(res),
});

// ── Validation schemas ────────────────────────────────────────────────────────
const registerSchema = {
  email:    { type: 'email',  required: true },
  password: { type: 'string', required: true, min: 8, max: 100 },
};

const loginSchema = {
  email:    { type: 'email',  required: true },
  password: { type: 'string', required: true, min: 1 },
};

const refreshSchema = {
  refresh_token: { type: 'string', required: true },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const signAccess = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

const storeRefreshToken = (userId, token) =>
  query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [userId, token]
  );

// ── POST /v1/auth/register ────────────────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req, res, next) => {
    const { email, password } = req.validated;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, role, created_at`,
        [email.toLowerCase(), passwordHash]
      );
      const user = result.rows[0];
      const accessToken  = signAccess({ userId: user.id, email: user.email, role: user.role });
      const refreshToken = uuidv4();
      await storeRefreshToken(user.id, refreshToken);

      logger.info('user.registered', { userId: user.id });

      return created(res, {
        user: { id: user.id, email: user.email, role: user.role, created_at: user.created_at },
        tokens: {
          access_token:  accessToken,
          refresh_token: refreshToken,
          token_type:    'Bearer',
          expires_in:    900,
        },
      }, `/v1/users/${user.id}`);
    } catch (err) {
      if (err.code === '23505') return errors.conflict(res, 'Email already registered');
      next(err);
    }
  }
);

// ── POST /v1/auth/login ───────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    const { email, password } = req.validated;
    try {
      const result = await query(
        `SELECT id, email, password_hash, role
         FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [email.toLowerCase()]
      );
      const user = result.rows[0];

      // Always run bcrypt — prevents timing attacks / user enumeration
      const validPassword = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, '$2b$12$invalidhashfortimingprevention000');

      if (!user || !validPassword) {
        return errors.unauthorized(res, 'Invalid email or password');
      }

      const accessToken  = signAccess({ userId: user.id, email: user.email, role: user.role });
      const refreshToken = uuidv4();
      await storeRefreshToken(user.id, refreshToken);
      await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

      logger.info('user.login', { userId: user.id });

      return ok(res, {
        user: { id: user.id, email: user.email, role: user.role },
        tokens: {
          access_token:  accessToken,
          refresh_token: refreshToken,
          token_type:    'Bearer',
          expires_in:    900,
        },
      });
    } catch (err) { next(err); }
  }
);

// ── POST /v1/auth/refresh ─────────────────────────────────────────────────────
router.post(
  '/refresh',
  validate(refreshSchema),
  async (req, res, next) => {
    const { refresh_token } = req.validated;
    try {
      const result = await query(
        `SELECT rt.user_id, u.email, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token = $1
           AND rt.revoked_at IS NULL
           AND rt.expires_at > NOW()`,
        [refresh_token]
      );
      if (!result.rows[0]) {
        return errors.unauthorized(res, 'Invalid or expired refresh token');
      }
      const { user_id, email, role } = result.rows[0];

      // Rotate — revoke old, issue new
      await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1`, [refresh_token]);
      const newRefresh   = uuidv4();
      const accessToken  = signAccess({ userId: user_id, email, role });
      await storeRefreshToken(user_id, newRefresh);

      return ok(res, {
        tokens: {
          access_token:  accessToken,
          refresh_token: newRefresh,
          token_type:    'Bearer',
          expires_in:    900,
        },
      });
    } catch (err) { next(err); }
  }
);

// ── POST /v1/auth/logout ──────────────────────────────────────────────────────
router.post(
  '/logout',
  validate(refreshSchema),
  async (req, res, next) => {
    const { refresh_token } = req.validated;
    try {
      await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1`, [refresh_token]);
      return ok(res, { message: 'Logged out successfully' });
    } catch (err) { next(err); }
  }
);

// ── GET /v1/auth/me ───────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, role, created_at, last_login_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.userId]
    );
    if (!result.rows[0]) return errors.notFound(res, 'User');
    return ok(res, { user: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
