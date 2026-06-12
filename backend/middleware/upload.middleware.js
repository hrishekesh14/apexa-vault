/**
 * APEXA VAULT — Multer Upload Middleware
 * Developed by Hrishekesh Varma
 *
 * Handles multipart/form-data from the frontend upload pipeline.
 * Files are received in memory (as Buffer) and then forwarded
 * directly to the IPFS service — never written to disk unencrypted.
 */

'use strict';

const multer = require('multer');

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024;
const MAX_FILES     = parseInt(process.env.MAX_FILES_PER_UPLOAD) || 10;

// Memory storage — files stay as Buffer, no disk writes
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowed = process.env.ALLOWED_FILE_TYPES || '*';

    // '*' means allow everything
    if (allowed === '*') return cb(null, true);

    const types = allowed.split(',').map(t => t.trim());
    if (types.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not permitted`), false);
    }
};

const upload = multer({
    storage,
    limits: {
        fileSize : MAX_FILE_SIZE,
        files    : MAX_FILES
    },
    fileFilter
});

// Error handler wrapper for multer errors
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 100}MB`
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: `Too many files. Maximum is ${MAX_FILES} per upload`
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next();
};

module.exports = { upload, handleUploadError };