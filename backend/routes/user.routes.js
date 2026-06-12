/**
 * APEXA VAULT — User Routes
 * Developed by Hrishekesh Varma
 *
 * Dependency map:
 *   server.js → ./routes/user.routes
 *             → ../controllers/user.controller  { getProfile, getActivity, getStorage,
 *                                                 updateProfile, deleteAccount }
 *             → ../middleware/auth.middleware    { protect }
 *
 * Endpoints:
 *   GET    /api/user/profile    — full profile + storage + file stats
 *   PATCH  /api/user/profile    — update username
 *   GET    /api/user/activity   — recent activity log (15 items)
 *   GET    /api/user/storage    — storage breakdown for updateStorageUI()
 *   DELETE /api/user/account    — deactivate account (requires password in body)
 *
 * Frontend mirrors:
 *   updateStorageUI()    → GET   /api/user/storage
 *   renderActivityLog()  → GET   /api/user/activity
 *   updateAIInsights()   → GET   /api/user/profile  (stats field)
 *   settingsModal        → GET   /api/user/profile
 */

'use strict';

const express = require('express');
const router  = express.Router();

const {
    getProfile,
    getActivity,
    getStorage,
    updateProfile,
    deleteAccount
} = require('../controllers/user.controller');

const { protect } = require('../middleware/auth.middleware');

// ── All user routes require authentication ───────────────────────
router.use(protect);

router.get('/profile',    getProfile);
router.patch('/profile',  updateProfile);
router.get('/activity',   getActivity);
router.get('/storage',    getStorage);
router.delete('/account', deleteAccount);

module.exports = router;