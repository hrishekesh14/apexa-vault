/**
 * APEXA VAULT — IPFS Routes
 * Developed by Hrishekesh Varma
 *
 * Dependency map:
 *   server.js → ./routes/ipfs.routes
 *             → ../controllers/ipfs.controller  { getStatus, getByCID, listPinned }
 *             → ../middleware/auth.middleware    { protect }
 *
 * Endpoints:
 *   GET  /api/ipfs/status        — test IPFS provider connectivity (protected)
 *   GET  /api/ipfs/files/list    — list all CIDs pinned for current user (protected)
 *   GET  /api/ipfs/:cid          — proxy-retrieve raw encrypted file by CID (protected)
 *
 * Route order matters:
 *   /files/list must be defined BEFORE /:cid to prevent 'files' being
 *   treated as a CID parameter.
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { getStatus, getByCID, listPinned } = require('../controllers/ipfs.controller');
const { protect }                          = require('../middleware/auth.middleware');

// 🔥 ADDED: Pinata utility import
const { testPinataConnection } = require('../utils/pinata');

// ── All IPFS routes require authentication ───────────────────────
router.use(protect);

// ── Static paths first (before param routes) ─────────────────────
router.get('/status',      getStatus);
router.get('/files/list',  listPinned);

// 🔥 ADDED: Pinata test route
// This checks whether Pinata API keys are working properly
router.get('/pinata-test', async (req, res) => {
    try {
        const result = await testPinataConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ── Dynamic CID lookup ───────────────────────────────────────────
router.get('/:cid',        getByCID);

module.exports = router;