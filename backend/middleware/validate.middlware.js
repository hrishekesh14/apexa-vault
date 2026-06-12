/**
 * APEXA VAULT — Validation Middleware
 * Developed by Hrishekesh Varma
 *
 * ISSUE 7 FIX:
 * express-validator rules for auth and upload endpoints.
 * Ensures backend and frontend field names are synchronized.
 *
 * Frontend sends (from registerForm):
 *   { username, email, password, confirmPassword }
 *
 * Frontend sends (from loginForm):
 *   { email, password }
 */

'use strict';

const { body, validationResult } = require('express-validator');

// ── Run validation and return errors if any ───────────────────────
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const messages = errors.array().map(e => e.msg);
        return res.status(400).json({
            success: false,
            message: messages[0],          // Show first error (matches frontend toast behavior)
            errors : messages              // Full list for debugging
        });
    }
    next();
};

// ── Register validation ───────────────────────────────────────────
// Matches frontend registerForm: username, email, password, confirmPassword
const validateRegister = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email address is required')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),

    body('confirmPassword')
        .optional()
        .custom((value, { req }) => {
            if (value && value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    handleValidationErrors
];

// ── Login validation ──────────────────────────────────────────────
// Matches frontend loginForm: email, password
const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Please enter your email address')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Please enter your password'),

    handleValidationErrors
];

// ── File upload validation ────────────────────────────────────────
const validateUpload = [
    body('encrypt')
        .optional()
        .isIn(['true', 'false'])
        .withMessage('encrypt must be "true" or "false"'),

    body('encryptionPassword')
        .optional()
        .custom((value, { req }) => {
            if (req.body.encrypt === 'true' && (!value || !value.trim())) {
                throw new Error('Encryption password is required when encrypt is enabled');
            }
            return true;
        }),

    handleValidationErrors
];

// ── Wallet address validation ─────────────────────────────────────
const validateWallet = [
    body('address')
        .trim()
        .notEmpty()
        .withMessage('Wallet address is required')
        .matches(/^0x[a-fA-F0-9]{40}$/)
        .withMessage('Invalid Ethereum wallet address format'),

    body('provider')
        .optional()
        .isIn(['metamask', 'walletconnect', 'coinbase'])
        .withMessage('Provider must be metamask, walletconnect, or coinbase'),

    handleValidationErrors
];

// ── Decrypt-download validation ───────────────────────────────────
const validateDecrypt = [
    body('fileId')
        .trim()
        .notEmpty()
        .withMessage('fileId is required')
        .isMongoId()
        .withMessage('fileId must be a valid MongoDB ID'),

    body('password')
        .notEmpty()
        .withMessage('Decryption password is required'),

    handleValidationErrors
];

module.exports = {
    validateRegister,
    validateLogin,
    validateUpload,
    validateWallet,
    validateDecrypt,
    handleValidationErrors
};