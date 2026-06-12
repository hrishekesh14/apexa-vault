/**
 * APEXA VAULT — IPFS Service
 * Developed by Hrishekesh Varma
 *
 * Mirrors and extends frontend IPFSService (app.js):
 *   - Real Pinata API upload
 *   - Web3.Storage fallback
 *   - Filebase fallback
 *   - Provider abstraction (swap via IPFS_PROVIDER env var)
 *
 * The frontend simulationMode flag is no longer needed here —
 * this is the real implementation.
 */

'use strict';

const axios    = require('axios');
const FormData = require('form-data');
const logger   = require('../utils/logger');

class IPFSService {

    constructor() {
        this.provider       = process.env.IPFS_PROVIDER || 'pinata';
        this.pinataGateway  = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
        this.w3Gateway      = 'https://w3s.link/ipfs/';
        this.localGateway   = 'http://localhost:8080/ipfs/';
    }

    /* ── PUBLIC: Upload a Buffer to IPFS ─────────────────────── */
    async upload(fileBuffer, fileName, metadata = {}) {
        logger.info(`IPFS upload started: ${fileName} via ${this.provider}`);

        switch (this.provider) {
            case 'pinata'     : return this._pinataUpload(fileBuffer, fileName, metadata);
            case 'web3storage': return this._web3storageUpload(fileBuffer, fileName, metadata);
            case 'filebase'   : return this._filebaseUpload(fileBuffer, fileName, metadata);
            default           : return this._pinataUpload(fileBuffer, fileName, metadata);
        }
    }

    /* ── PUBLIC: Retrieve a file Buffer from IPFS by CID ──────── */
    async retrieve(cid) {
        logger.info(`IPFS retrieve: ${cid}`);

        const gateways = [
            `${this.pinataGateway}${cid}`,
            `https://ipfs.io/ipfs/${cid}`,
            `${this.w3Gateway}${cid}`,
            `https://cloudflare-ipfs.com/ipfs/${cid}`
        ];

        // Try each gateway in order
        for (const url of gateways) {
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout     : 30000,
                    headers     : this._pinataAuthHeaders()
                });
                logger.info(`IPFS retrieve success from: ${url}`);
                return Buffer.from(response.data);
            } catch (err) {
                logger.warn(`Gateway ${url} failed: ${err.message}`);
                continue;
            }
        }

        throw new Error(`Failed to retrieve CID ${cid} from any gateway`);
    }

    /* ── PUBLIC: Unpin a CID (delete from Pinata) ─────────────── */
    async unpin(cid) {
        if (this.provider !== 'pinata') return { success: true };

        try {
            await axios.delete(
                `https://api.pinata.cloud/pinning/unpin/${cid}`,
                { headers: this._pinataAuthHeaders() }
            );
            logger.info(`Unpinned CID: ${cid}`);
            return { success: true };
        } catch (err) {
            logger.warn(`Unpin failed for ${cid}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /* ── PUBLIC: Test IPFS connectivity ─────────────────────────── */
    async testConnection() {
        try {
            const res = await axios.get(
                'https://api.pinata.cloud/data/testAuthentication',
                { headers: this._pinataAuthHeaders(), timeout: 8000 }
            );
            return { connected: true, provider: 'Pinata', message: res.data.message };
        } catch (err) {
            return { connected: false, error: err.message };
        }
    }

    /* ── PRIVATE: Pinata Upload ──────────────────────────────── */
    async _pinataUpload(fileBuffer, fileName, metadata) {
        const form = new FormData();
        form.append('file', fileBuffer, {
            filename   : `encrypted_${fileName}`,
            contentType: 'application/octet-stream'
        });

        // Pinata metadata (visible in Pinata dashboard)
        const pinataMetadata = {
            name      : `apexa_${fileName}`,
            keyvalues : {
                app      : 'apexa-vault',
                encrypted: 'true',
                owner    : metadata.userId || 'unknown',
                ...metadata
            }
        };
        form.append('pinataMetadata', JSON.stringify(pinataMetadata));

        // Pin options — CIDv1
        form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

        const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    ...this._pinataAuthHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength   : Infinity,
                timeout         : 120000 // 2 min for large files
            }
        );

        const { IpfsHash, PinSize, Timestamp } = response.data;

        logger.info(`Pinata upload success: CID=${IpfsHash}, size=${PinSize}`);

        return {
            cid              : IpfsHash,
            size             : PinSize,
            url              : `${this.pinataGateway}${IpfsHash}`,
            provider         : 'Pinata',
            pinnedAt         : Timestamp,
            replicationFactor: 3
        };
    }

    /* ── PRIVATE: Web3.Storage Upload ───────────────────────── */
    async _web3storageUpload(fileBuffer, fileName, metadata) {
        const { Web3Storage, File } = require('web3.storage'); // optional dep
        const client = new Web3Storage({ token: process.env.WEB3_STORAGE_TOKEN });

        const file = new File([fileBuffer], `encrypted_${fileName}`, {
            type: 'application/octet-stream'
        });

        const cid = await client.put([file], {
            name   : `apexa_${fileName}`,
            wrapWithDirectory: false
        });

        logger.info(`Web3.Storage upload success: CID=${cid}`);

        return {
            cid              : cid,
            size             : fileBuffer.length,
            url              : `${this.w3Gateway}${cid}`,
            provider         : 'Web3.Storage',
            pinnedAt         : new Date().toISOString(),
            replicationFactor: 5
        };
    }

    /* ── PRIVATE: Filebase Upload (S3-compatible IPFS) ──────── */
    async _filebaseUpload(fileBuffer, fileName, metadata) {
        // Uses AWS S3 SDK with Filebase endpoint
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const client = new S3Client({
            endpoint       : 'https://s3.filebase.com',
            region         : 'us-east-1',
            credentials    : {
                accessKeyId    : process.env.FILEBASE_ACCESS_KEY,
                secretAccessKey: process.env.FILEBASE_SECRET_KEY
            }
        });

        const key = `encrypted_${Date.now()}_${fileName}`;
        const cmd = new PutObjectCommand({
            Bucket     : process.env.FILEBASE_BUCKET,
            Key        : key,
            Body       : fileBuffer,
            ContentType: 'application/octet-stream',
            Metadata   : { app: 'apexa-vault', owner: metadata.userId || '' }
        });

        const response = await client.send(cmd);
        const cid = response.$metadata?.headers?.['x-amz-meta-cid'] || '';

        return {
            cid              : cid,
            size             : fileBuffer.length,
            url              : `https://ipfs.filebase.io/ipfs/${cid}`,
            provider         : 'Filebase',
            pinnedAt         : new Date().toISOString(),
            replicationFactor: 3
        };
    }

    /* ── PRIVATE: Pinata auth headers ───────────────────────── */
    _pinataAuthHeaders() {
        if (process.env.PINATA_JWT) {
            return { Authorization: `Bearer ${process.env.PINATA_JWT}` };
        }
        return {
            pinata_api_key       : process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_API_SECRET
        };
    }

    /* ── Utility: Format bytes for display ──────────────────── */
    formatSize(bytes) {
        if (bytes < 1024)            return `${bytes} B`;
        if (bytes < 1024 ** 2)       return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3)       return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    }
}

module.exports = new IPFSService();