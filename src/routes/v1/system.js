/**
 * routes/v1/system.js
 * --------------------
 * Operational endpoints — visibility without auth
 *
 * GET /health        → liveness check (is the process alive?)
 * GET /ready         → readiness check (can it serve traffic?)
 * GET /v1/version    → API version info
 *
 * Design decisions:
 * - /health and /ready are at root (no /v1 prefix) — K8s probes expect this
 * - /health is lightweight — no DB call (used for liveness)
 * - /ready checks DB connectivity — used for readiness before traffic
 * - /v1/version exposes commit SHA + uptime for debugging
 */

const express = require('express');
const { pool } = require('../../db');
const { ok, errors } = require('../../utils/response');

const router = express.Router();

const START_TIME = Date.now();

// ── GET /health — liveness ────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  return ok(res, {
    status:    'ok',
    timestamp: new Date().toISOString(),
  });
});

// ── GET /ready — readiness ────────────────────────────────────────────────────
router.get('/ready', async (req, res) => {
  const checks = { database: 'unknown' };
  let allOk = true;

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    allOk = false;
  }

  const status = allOk ? 200 : 503;
  return res.status(status).json({
    ok: allOk,
    data: {
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  });
});

// ── GET /v1/version ───────────────────────────────────────────────────────────
router.get('/v1/version', (req, res) => {
  return ok(res, {
    version:    process.env.npm_package_version || '1.0.0',
    api:        'v1',
    commit:     process.env.COMMIT_SHA || 'local',
    env:        process.env.NODE_ENV || 'development',
    uptime_ms:  Date.now() - START_TIME,
  });
});

module.exports = router;
