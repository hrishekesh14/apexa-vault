/**
 * APEXA VAULT — Pinata Service (Singleton)
 * Developed by Hrishekesh Varma
 *
 * ISSUES 1, 2, 3 FIX:
 *
 * Problem 1: No credential validation at startup → process.env.PINATA_JWT check
 * Problem 2: Old @pinata/sdk usage → replaced with direct REST API via axios
 *            (works with any Pinata JWT without SDK version conflicts)
 * Problem 3: Pinata logic scattered → centralized here as a clean service class
 *
 * This module is the SINGLE point of contact for all Pinata operations.
 * All other services (ipfs.service.js) delegate here.
 *
 * Pinata REST API docs: https://docs.pinata.cloud/api-reference
 */

'use strict';

const axios    = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const logger   = require('../utils/logger');

const PINATA_BASE      = 'https://api.pinata.cloud';
const PINATA_GATEWAY   = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
const REQUEST_TIMEOUT  = 120_000; // 2 minutes for large file uploads

class PinataService {

    constructor() {
        // ISSUE 1 FIX: Validate JWT at construction time (module load = startup)
        this._jwt = process.env.PINATA_JWT;

        if (!this._jwt || !this._jwt.trim()) {
            throw new Error(
                'PINATA_JWT is missing or empty in your .env file.\n' +
                '  1. Go to https://app.pinata.cloud/keys\n' +
                '  2. Generate a new API key with Admin scope\n' +
                '  3. Copy the JWT and paste it into your .env as:\n' +
                '     PINATA_JWT=eyJhbGci...\n' +
                '  Server cannot start without this credential.'
            );
        }

        this._gateway = PINATA_GATEWAY;
        this._authenticated = false;

        logger.info(`[Pinata] Service initialized — JWT loaded (${this._jwt.length} chars)`);
    }

    // ── Auth Headers ─────────────────────────────────────────────
    _headers(extra = {}) {
        return {
            Authorization: `Bearer ${this._jwt}`,
            ...extra
        };
    }

    // ─────────────────────────────────────────────────────────────
    // HEALTH CHECK
    // GET /data/testAuthentication
    // ISSUE 5 FIX: Used by GET /api/ipfs/pinata-test
    // ─────────────────────────────────────────────────────────────
    async testAuthentication() {
        try {
            const response = await axios.get(
                `${PINATA_BASE}/data/testAuthentication`,
                {
                    headers: this._headers(),
                    timeout: 10_000
                }
            );
            this._authenticated = true;
            logger.info('[Pinata] Authentication test passed');
            return {
                success      : true,
                authenticated: true,
                provider     : 'Pinata',
                message      : response.data?.message || 'Authenticated'
            };
        } catch (err) {
            this._authenticated = false;
            const status  = err.response?.status;
            const detail  = err.response?.data?.error?.details || err.message;

            logger.error(`[Pinata] Authentication test failed: ${status} — ${detail}`);

            if (status === 401) {
                throw new Error(
                    'Pinata authentication failed — your PINATA_JWT is invalid or expired.\n' +
                    'Generate a new one at: https://app.pinata.cloud/keys'
                );
            }
            throw new Error(`Pinata unreachable: ${detail}`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // FILE UPLOAD
    // POST /pinning/pinFileToIPFS
    // ISSUE 4 FIX: Buffer → Readable stream, proper MIME, progress logging
    // ─────────────────────────────────────────────────────────────
    /**
     * @param {Buffer}  fileBuffer   — raw file data (already encrypted if needed)
     * @param {string}  fileName     — original file name
     * @param {string}  mimeType     — MIME type of the file
     * @param {object}  metadata     — optional key/value metadata for Pinata dashboard
     * @returns {{ cid, pinataUrl, size, provider, pinnedAt, replicationFactor }}
     */
    async uploadFile(fileBuffer, fileName, mimeType = 'application/octet-stream', metadata = {}) {
        if (!Buffer.isBuffer(fileBuffer)) {
            throw new TypeError('fileBuffer must be a Node.js Buffer');
        }

        logger.info(`[Pinata] Uploading: ${fileName} (${this._formatSize(fileBuffer.length)}) type=${mimeType}`);

        // ISSUE 4 FIX: Convert Buffer → Readable stream (required by form-data for binary uploads)
        const readable = new Readable();
        readable.push(fileBuffer);
        readable.push(null); // signal end of stream

        const form = new FormData();
        form.append('file', readable, {
            filename   : fileName,
            contentType: mimeType,
            knownLength: fileBuffer.length // prevents chunked encoding issues
        });

        // Pinata metadata stored on dashboard
        const pinataMetadata = JSON.stringify({
            name     : `apexa_${fileName}`,
            keyvalues: {
                app      : 'apexa-vault',
                owner    : String(metadata.userId   || 'unknown'),
                encrypted: String(metadata.encrypted || 'false'),
                mimeType : mimeType,
                ...this._sanitizeMetadata(metadata)
            }
        });
        form.append('pinataMetadata', pinataMetadata);

        // CIDv1 (bafybei... format — matches frontend simulation)
        const pinataOptions = JSON.stringify({ cidVersion: 1 });
        form.append('pinataOptions', pinataOptions);

        try {
            const response = await axios.post(
                `${PINATA_BASE}/pinning/pinFileToIPFS`,
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        ...this._headers()
                    },
                    maxContentLength: Infinity,
                    maxBodyLength   : Infinity,
                    timeout         : REQUEST_TIMEOUT,
                    onUploadProgress: (evt) => {
                        if (evt.total) {
                            const pct = Math.round((evt.loaded / evt.total) * 100);
                            logger.info(`[Pinata] Upload progress: ${pct}% for ${fileName}`);
                        }
                    }
                }
            );

            const { IpfsHash, PinSize, Timestamp } = response.data;

            logger.info(`[Pinata] Upload success: CID=${IpfsHash}, size=${PinSize}`);

            return {
                cid              : IpfsHash,
                pinataUrl        : `${this._gateway}${IpfsHash}`,
                size             : PinSize,
                provider         : 'Pinata',
                pinnedAt         : Timestamp || new Date().toISOString(),
                replicationFactor: 3
            };
        } catch (err) {
            this._handleApiError(err, `Upload failed for ${fileName}`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // JSON UPLOAD (for metadata, manifests, etc.)
    // POST /pinning/pinJSONToIPFS
    // ─────────────────────────────────────────────────────────────
    /**
     * @param {object}  jsonBody     — any JSON-serializable object
     * @param {string}  name         — label shown in Pinata dashboard
     * @returns {{ cid, pinataUrl, pinnedAt }}
     */
    async uploadJSON(jsonBody, name = 'apexa-metadata') {
        logger.info(`[Pinata] Uploading JSON: ${name}`);

        try {
            const response = await axios.post(
                `${PINATA_BASE}/pinning/pinJSONToIPFS`,
                {
                    pinataContent : jsonBody,
                    pinataMetadata: { name },
                    pinataOptions : { cidVersion: 1 }
                },
                {
                    headers: this._headers({ 'Content-Type': 'application/json' }),
                    timeout: 30_000
                }
            );

            const { IpfsHash, Timestamp } = response.data;
            logger.info(`[Pinata] JSON upload success: CID=${IpfsHash}`);

            return {
                cid      : IpfsHash,
                pinataUrl: `${this._gateway}${IpfsHash}`,
                pinnedAt : Timestamp || new Date().toISOString()
            };
        } catch (err) {
            this._handleApiError(err, `JSON upload failed: ${name}`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // UNPIN / DELETE
    // DELETE /pinning/unpin/:cid
    // ─────────────────────────────────────────────────────────────
    async unpin(cid) {
        if (!cid) return { success: false, error: 'No CID provided' };

        try {
            await axios.delete(
                `${PINATA_BASE}/pinning/unpin/${cid}`,
                {
                    headers: this._headers(),
                    timeout: 15_000
                }
            );
            logger.info(`[Pinata] Unpinned: ${cid}`);
            return { success: true, cid };
        } catch (err) {
            const detail = err.response?.data?.error || err.message;
            logger.warn(`[Pinata] Unpin failed for ${cid}: ${detail}`);
            // Return soft failure — don't crash if unpin fails
            return { success: false, cid, error: detail };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // PIN METADATA LOOKUP
    // GET /data/pinList?hashContains=<cid>
    // ─────────────────────────────────────────────────────────────
    async getPinMetadata(cid) {
        try {
            const response = await axios.get(
                `${PINATA_BASE}/data/pinList`,
                {
                    headers: this._headers(),
                    params : { hashContains: cid, status: 'pinned' },
                    timeout: 10_000
                }
            );
            const rows = response.data?.rows || [];
            return rows.length > 0 ? rows[0] : null;
        } catch (err) {
            logger.warn(`[Pinata] getPinMetadata failed for ${cid}: ${err.message}`);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────
    _handleApiError(err, context = '') {
        const status  = err.response?.status;
        const reason  = err.response?.data?.error?.reason   || '';
        const details = err.response?.data?.error?.details  || err.message;

        logger.error(`[Pinata] ${context}: HTTP ${status} — ${reason} ${details}`);

        if (status === 401) {
            throw new Error('Pinata JWT invalid or expired. Update PINATA_JWT in .env');
        }
        if (status === 429) {
            throw new Error('Pinata rate limit exceeded. Please wait and retry.');
        }
        if (status === 413) {
            throw new Error('File too large for Pinata. Check your plan limits.');
        }
        throw new Error(`Pinata error: ${details || reason || 'Unknown error'}`);
    }

    // Pinata keyvalues must be strings — sanitize
    _sanitizeMetadata(obj) {
        const safe = {};
        for (const [k, v] of Object.entries(obj)) {
            if (['userId', 'encrypted', 'mimeType'].includes(k)) continue; // already added
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                safe[k] = String(v);
            }
        }
        return safe;
    }

    _formatSize(bytes) {
        if (bytes < 1024)        return `${bytes} B`;
        if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    }
}

// ── Singleton export ──────────────────────────────────────────────
// Instantiated once at module load time.
// If PINATA_JWT is missing, the constructor throws and the server
// exits immediately (caught by env.js validation before this runs).
let _instance;

const getPinataService = () => {
    if (!_instance) {
        _instance = new PinataService();
    }
    return _instance;
};

module.exports = getPinataService();