/**
 * APEXA VAULT — Auth Routes
 * Developed by Hrishekesh Varma
 *
 * Dependency map:
 *   server.js → ./routes/auth.routes
 *             → ../controllers/auth.controller  { register, login, refresh, logout, getMe }
 *             → ../middleware/auth.middleware    { protect }
 *
 * Endpoints:
 *   POST   /api/auth/register  — create account (mirrors frontend registerForm)
 *   POST   /api/auth/login     — sign in        (mirrors frontend loginForm)
 *   POST   /api/auth/refresh   — rotate JWT
 *   POST   /api/auth/logout    — clear session   [protected]
 *   GET    /api/auth/me        — current user    [protected]
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { register, login, refresh, logout, getMe } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// ── Public routes ────────────────────────────────────────────────
router.post('/register', register);
router.post('/login',    login);
router.post('/refresh',  refresh);

// ── Protected routes ─────────────────────────────────────────────
router.post('/logout', protect, logout);
router.get('/me',      protect, getMe);

module.exports = router;