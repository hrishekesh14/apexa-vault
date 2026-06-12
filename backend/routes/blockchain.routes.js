/**
 * APEXA VAULT — Blockchain Routes
 * Developed by Hrishekesh Varma
 *
 * Dependency map:
 *   server.js → ./routes/blockchain.routes
 *             → ../controllers/blockchain.controller  { getRecords, getRecord, verifyFile,
 *                                                       getNetworkInfo, saveWallet }
 *             → ../middleware/auth.middleware          { protect }
 *
 * Endpoints:
 *   GET  /api/blockchain/records             — all chain records for current user
 *   GET  /api/blockchain/records/:fileId     — full chain record for a single file
 *   POST /api/blockchain/verify/:fileId      — re-verify integrity against on-chain hash
 *   GET  /api/blockchain/network             — live network info (block, gas)
 *   POST /api/blockchain/wallet              — save connected wallet address
 *
 * Frontend mirrors:
 *   BlockchainLedgerUI.render()  → GET  /api/blockchain/records
 *   _apexaShowBlockchainRecord() → GET  /api/blockchain/records/:fileId
 *   chain-verify button          → POST /api/blockchain/verify/:fileId
 *   WalletUI (connect wallet)    → POST /api/blockchain/wallet
 *
 * Route order:
 *   /records and /network are static — must appear before /:fileId
 */

'use strict';

const express = require('express');
const router  = express.Router();

const {
    getRecords,
    getRecord,
    verifyFile,
    getNetworkInfo,
    saveWallet
} = require('../controllers/blockchain.controller');

const { protect } = require('../middleware/auth.middleware');

// ── All blockchain routes require authentication ──────────────────
router.use(protect);

// ── Static routes first ──────────────────────────────────────────
router.get('/records',          getRecords);
router.get('/network',          getNetworkInfo);
router.post('/wallet',          saveWallet);

// ── Param routes ─────────────────────────────────────────────────
router.get('/records/:fileId',  getRecord);
router.post('/verify/:fileId',  verifyFile);

module.exports = router;