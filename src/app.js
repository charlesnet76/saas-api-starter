/**
 * app.js
 * ------
 * Application entry point.
 *
 * Route map:
 *   GET  /health          → liveness probe
 *   GET  /ready           → readiness probe
 *   GET  /v1/version      → version info
 *
 *   POST /v1/auth/register
 *   POST /v1/auth/login
 *   POST /v1/auth/refresh
 *   POST /v1/auth/logout
 *   GET  /v1/auth/me
 *
 *   GET    /v1/users       (admin)
 *   GET    /v1/users/:id
 *   PATCH  /v1/users/:id
 *   DELETE /v1/users/:id  (admin)
 */

require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { migrate } = require('./db/migrations');
const logger     = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Routes
const systemRoutes = require('./routes/v1/system');
const authRoutes   = require('./routes/v1/auth');
const userRoutes   = require('./routes/v1/users');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:  process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => res.status(429).json({
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' }
  }),
}));

// ── Parsing ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method:  req.method,
      path:    req.path,
      status:  res.statusCode,
      ms:      Date.now() - start,
    });
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(systemRoutes);           // /health, /ready, /v1/version
app.use('/v1/auth',  authRoutes);
app.use('/v1/users', userRoutes);

// ── 404 + error handler ───────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    logger.info('starting', { port: PORT, env: process.env.NODE_ENV });
    await migrate();
    app.listen(PORT, () => {
      logger.info('ready', { port: PORT });
    });
  } catch (err) {
    logger.error('startup_failed', { error: err.message });
    process.exit(1);
  }
};

start();
module.exports = app;
