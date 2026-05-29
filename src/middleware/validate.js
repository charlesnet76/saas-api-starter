/**
 * validate.js
 * -----------
 * Lightweight input validation middleware.
 *
 * Usage:
 *   router.post('/users', validate(registerSchema), registerHandler)
 *
 * Schema format:
 *   {
 *     email:    { type: 'email',   required: true },
 *     password: { type: 'string',  required: true, min: 8, max: 100 },
 *     role:     { type: 'enum',    values: ['user', 'admin'], default: 'user' },
 *     page:     { type: 'integer', min: 1, default: 1, source: 'query' }
 *   }
 *
 * Returns 422 with field-level errors if validation fails.
 * Attaches validated + coerced values to req.validated.
 */

const { errors } = require('../utils/response');

const validators = {
  string: (val, rule) => {
    if (typeof val !== 'string') return 'must be a string';
    const v = val.trim();
    if (rule.min && v.length < rule.min) return `must be at least ${rule.min} characters`;
    if (rule.max && v.length > rule.max) return `must be at most ${rule.max} characters`;
    return null;
  },
  email: (val) => {
    if (typeof val !== 'string') return 'must be a string';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) return 'must be a valid email address';
    return null;
  },
  integer: (val, rule) => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return 'must be an integer';
    if (rule.min !== undefined && n < rule.min) return `must be at least ${rule.min}`;
    if (rule.max !== undefined && n > rule.max) return `must be at most ${rule.max}`;
    return null;
  },
  boolean: (val) => {
    if (val !== true && val !== false && val !== 'true' && val !== 'false') return 'must be true or false';
    return null;
  },
  enum: (val, rule) => {
    if (!rule.values.includes(val)) return `must be one of: ${rule.values.join(', ')}`;
    return null;
  },
  uuid: (val) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val))
      return 'must be a valid UUID';
    return null;
  },
};

const coerce = (val, type) => {
  if (type === 'integer') return parseInt(val, 10);
  if (type === 'boolean') return val === true || val === 'true';
  if (type === 'string' || type === 'email') return typeof val === 'string' ? val.trim() : val;
  return val;
};

const validate = (schema) => (req, res, next) => {
  const fieldErrors = {};
  const validated = {};

  for (const [field, rule] of Object.entries(schema)) {
    const source = rule.source === 'query' ? req.query
                 : rule.source === 'params' ? req.params
                 : req.body;

    let val = source[field];

    // Apply default
    if ((val === undefined || val === null || val === '') && rule.default !== undefined) {
      val = rule.default;
    }

    // Required check
    if (rule.required && (val === undefined || val === null || val === '')) {
      fieldErrors[field] = 'is required';
      continue;
    }

    // Skip optional missing fields
    if (val === undefined || val === null || val === '') continue;

    // Type validation
    const validator = validators[rule.type];
    if (validator) {
      const err = validator(val, rule);
      if (err) { fieldErrors[field] = err; continue; }
    }

    validated[field] = coerce(val, rule.type);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return errors.validation(res, 'Request validation failed', fieldErrors);
  }

  req.validated = validated;
  next();
};

module.exports = { validate };
