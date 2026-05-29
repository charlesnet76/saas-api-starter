/**
 * errorHandler.js
 * ---------------
 * Global error handler — last middleware in the chain.
 *
 * Maps known error types to structured responses.
 * Unknown errors return 500 with no internal detail exposed.
 *
 * Every error response uses the same envelope:
 * { ok: false, error: { code, message } }
 */

const logger = require('../utils/logger');
const { errors } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  // Already responded
  if (res.headersSent) return next(err);

  // Log everything with context
  logger.error('unhandled_error', {
    error:  err.message,
    code:   err.code,
    stack:  process.env.NODE_ENV === 'development' ? err.stack : undefined,
    method: req.method,
    path:   req.path,
    userId: req.user?.userId,
  });

  // PostgreSQL errors
  if (err.code === '23505') return errors.conflict(res, 'Resource already exists');
  if (err.code === '23503') return errors.badRequest(res, 'Referenced resource does not exist');
  if (err.code === '22P02') return errors.badRequest(res, 'Invalid UUID format');

  // JWT errors
  if (err.name === 'JsonWebTokenError') return errors.unauthorized(res, 'Invalid token');
  if (err.name === 'TokenExpiredError') return errors.unauthorized(res, 'Token expired');

  // Default 500
  return errors.internal(res);
};

// 404 handler — route not found
const notFound = (req, res) => {
  return res.status(404).json({
    ok: false,
    error: {
      code:    'NOT_FOUND',
      message: `Route ${req.method} ${req.path} does not exist`,
      hint:    'Check the API documentation at /v1/version',
    },
  });
};

module.exports = { errorHandler, notFound };
