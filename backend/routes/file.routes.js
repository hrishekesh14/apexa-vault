/**
 * APEXA VAULT — File Routes
 * Developed by Hrishekesh Varma
 *
 * Dependency map:
 *   server.js → ./routes/file.routes
 *             → ../controllers/file.controller  { uploadFiles, getFiles, decryptDownload,
 *                                                 downloadFile, deleteFile, getFile }
 *             → ../middleware/auth.middleware    { protect }
 *             → ../middleware/upload.middleware  { upload, handleUploadError }
 *
 * All routes protected by JWT (protect middleware).
 *
 * Endpoints:
 *   POST   /api/files/upload             — upload one or more files (multipart)
 *   GET    /api/files                    — list all files for current user
 *   GET    /api/files/:id                — get single file metadata
 *   GET    /api/files/:id/download       — download unencrypted file from IPFS
 *   POST   /api/files/decrypt-download   — verify password + decrypt + download
 *   DELETE /api/files/:id                — soft-delete file + unpin from IPFS
 *
 * Frontend mirrors:
 *   processUpload()    → POST /api/files/upload
 *   renderRecentFiles()→ GET  /api/files
 *   handleDownload()   → GET  /api/files/:id/download
 *   showDecryptionModal→ POST /api/files/decrypt-download
 *   deleteFile()       → DELETE /api/files/:id
 */

'use strict';

const express = require('express');
const router  = express.Router();

const {
    uploadFiles,
    getFiles,
    getFile,
    downloadFile,
    decryptDownload,
    deleteFile
} = require('../controllers/file.controller');

const { protect }                    = require('../middleware/auth.middleware');
const { upload, handleUploadError }  = require('../middleware/upload.middleware');

// ── All file routes require authentication ───────────────────────
router.use(protect);

// ── List / metadata ──────────────────────────────────────────────
router.get('/',    getFiles);
router.get('/:id', getFile);

// ── Upload ───────────────────────────────────────────────────────
// upload.array('files', 10) accepts up to 10 files from field 'files[]'
router.post(
    '/upload',
    upload.array('files', 10),
    handleUploadError,
    uploadFiles
);

// ── Download ─────────────────────────────────────────────────────
// decrypt-download must be defined BEFORE /:id routes to avoid param collision
router.post('/decrypt-download', decryptDownload);
router.get('/:id/download',      downloadFile);

// ── Delete ───────────────────────────────────────────────────────
router.delete('/:id', deleteFile);

module.exports = router;