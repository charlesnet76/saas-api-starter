const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;

  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    method: req.method,
    path: req.path,
  });

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
  });
};

module.exports = errorHandler;
