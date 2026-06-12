/**
 * APEXA VAULT — Environment Validation
 * Developed by Hrishekesh Varma
 *
 * ISSUE 6 FIX:
 * Validates all required environment variables at server startup.
 * Server process exits immediately with a clear error message
 * if any required variable is missing or empty.
 *
 * Usage: require('./config/env') — called as the FIRST line of server.js
 * after require('dotenv').config()
 */

'use strict';

// ── Required variables — server cannot start without these ────────
const REQUIRED = [
    'PORT',
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'PINATA_JWT'
];

// ── Recommended — warn but do not abort ───────────────────────────
const RECOMMENDED = [
    'FRONTEND_URL',
    'JWT_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
    'NODE_ENV',
    'MASTER_ENCRYPTION_KEY',
    'PINATA_GATEWAY',
    'BLOCKCHAIN_NETWORK'
];

const validateEnv = () => {
    const missing  = [];
    const empty    = [];

    for (const key of REQUIRED) {
        if (!(key in process.env)) {
            missing.push(key);
        } else if (!process.env[key].trim()) {
            empty.push(key);
        }
    }

    if (missing.length > 0 || empty.length > 0) {
        console.error('\n');
        console.error('╔══════════════════════════════════════════════════════════╗');
        console.error('║        APEXA VAULT — ENVIRONMENT VALIDATION FAILED      ║');
        console.error('║        Developed by Hrishekesh Varma                    ║');
        console.error('╠══════════════════════════════════════════════════════════╣');

        if (missing.length > 0) {
            console.error('║  MISSING variables (not in .env file):                  ║');
            missing.forEach(k => console.error(`║    ✗  ${k.padEnd(52)}║`));
        }

        if (empty.length > 0) {
            console.error('║  EMPTY variables (defined but blank):                   ║');
            empty.forEach(k => console.error(`║    ✗  ${k.padEnd(52)}║`));
        }

        console.error('╠══════════════════════════════════════════════════════════╣');
        console.error('║  ACTION: Copy .env.example → .env and fill all values   ║');
        console.error('║  For PINATA_JWT: get from https://app.pinata.cloud/keys ║');
        console.error('╚══════════════════════════════════════════════════════════╝');
        console.error('\n');

        process.exit(1);
    }

    // Warn about recommended but non-blocking vars
    const missingRec = RECOMMENDED.filter(k => !(k in process.env) || !process.env[k]?.trim());
    if (missingRec.length > 0) {
        console.warn('[ENV] Recommended variables not set:', missingRec.join(', '));
    }

    // Security warnings
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        console.warn('[ENV] WARNING: JWT_SECRET is too short. Use at least 32 characters.');
    }

    if (process.env.NODE_ENV === 'production') {
        if (process.env.PINATA_JWT?.startsWith('eyJ') === false) {
            console.warn('[ENV] WARNING: PINATA_JWT does not look like a valid JWT token.');
        }
    }

    console.log('[ENV] ✓ All required environment variables loaded successfully.');
    console.log(`[ENV] ✓ NODE_ENV       : ${process.env.NODE_ENV || 'development'}`);
    console.log(`[ENV] ✓ PORT           : ${process.env.PORT}`);
    console.log(`[ENV] ✓ IPFS Provider  : ${process.env.IPFS_PROVIDER || 'pinata'}`);
    console.log(`[ENV] ✓ Blockchain     : ${process.env.BLOCKCHAIN_NETWORK || 'mumbai'}`);
    console.log(`[ENV] ✓ PINATA_JWT     : ${process.env.PINATA_JWT ? '✓ Loaded (' + process.env.PINATA_JWT.length + ' chars)' : '✗ MISSING'}`);
};

module.exports = validateEnv;