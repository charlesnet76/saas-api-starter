/**
 * response.js
 * -----------
 * Unified response formatter.
 *
 * Every endpoint returns the same envelope so integrators
 * can always predict the response shape:
 *
 *   Success:
 *   {
 *     "ok": true,
 *     "data": { ... },
 *     "meta": { ... }       // optional — pagination, counts
 *   }
 *
 *   Error:
 *   {
 *     "ok": false,
 *     "error": {
 *       "code": "VALIDATION_ERROR",
 *       "message": "human readable",
 *       "fields": { ... }   // optional — field-level errors
 *     }
 *   }
 *
 * This eliminates the "what shape does this endpoint return?" problem.
 */

const ok = (res, data, meta = null, status = 200) => {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};

const created = (res, data, location = null) => {
  if (location) res.setHeader('Location', location);
  return ok(res, data, null, 201);
};

const noContent = (res) => res.status(204).send();

const error = (res, status, code, message, fields = null) => {
  const body = { ok: false, error: { code, message } };
  if (fields) body.error.fields = fields;
  return res.status(status).json(body);
};

// Standardized error codes — integrators check these, not HTTP status
const errors = {
  badRequest:      (res, message, fields) => error(res, 400, 'BAD_REQUEST',       message, fields),
  validation:      (res, message, fields) => error(res, 422, 'VALIDATION_ERROR',  message, fields),
  unauthorized:    (res, message)         => error(res, 401, 'UNAUTHORIZED',       message || 'Authentication required'),
  forbidden:       (res, message)         => error(res, 403, 'FORBIDDEN',          message || 'Insufficient permissions'),
  notFound:        (res, resource)        => error(res, 404, 'NOT_FOUND',          `${resource} not found`),
  conflict:        (res, message)         => error(res, 409, 'CONFLICT',           message),
  tooManyRequests: (res)                  => error(res, 429, 'RATE_LIMITED',       'Too many requests, please slow down'),
  internal:        (res)                  => error(res, 500, 'INTERNAL_ERROR',     'An unexpected error occurred'),
};

module.exports = { ok, created, noContent, errors };
