/**
 * APEXA VAULT — Server-Side Encryption Service
 * Developed by Hrishekesh Varma
 *
 * Mirrors frontend EncryptionService (app.js) exactly:
 *   - AES-256-GCM
 *   - PBKDF2 key derivation (250,000 iterations, SHA-256)
 *   - Packed format: [salt(16)] + [iv(12)] + [ciphertext]
 *   - SHA-256 integrity hashing
 *
 * This allows server to validate/re-encrypt files that came
 * from the frontend and maintain the same format.
 */

'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ALGORITHM      = 'aes-256-gcm';
const KEY_LENGTH     = 32;   // 256 bits
const IV_LENGTH      = 12;   // 96 bits (GCM standard)
const SALT_LENGTH    = 16;   // 128 bits
const TAG_LENGTH     = 16;   // 128 bits (GCM auth tag)
const PBKDF2_ITERS   = 250000;
const PBKDF2_DIGEST  = 'sha256';
const SHARD_SIZE     = 256 * 1024; // 256KB — matches frontend

class EncryptionService {

    /**
     * Derive a 256-bit key from a password using PBKDF2
     * Matches frontend: EncryptionService.deriveKey()
     */
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(
            password,
            salt,
            PBKDF2_ITERS,
            KEY_LENGTH,
            PBKDF2_DIGEST
        );
    }

    /**
     * Encrypt a Buffer with AES-256-GCM
     * Output format: [salt(16)] + [iv(12)] + [authTag(16)] + [ciphertext]
     * Compatible with frontend EncryptionService.encrypt()
     *
     * Note: Node's GCM requires extracting the auth tag separately
     * The frontend Web Crypto API appends auth tag to ciphertext automatically;
     * we do the same here by appending it explicitly.
     */
    encrypt(buffer, password) {
        const salt   = crypto.randomBytes(SALT_LENGTH);
        const iv     = crypto.randomBytes(IV_LENGTH);
        const key    = this.deriveKey(password, salt);

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag   = cipher.getAuthTag();

        // Pack: salt(16) + iv(12) + authTag(16) + ciphertext
        return Buffer.concat([salt, iv, authTag, encrypted]);
    }

    /**
     * Decrypt a Buffer with AES-256-GCM
     * Input format: [salt(16)] + [iv(12)] + [authTag(16)] + [ciphertext]
     */
    decrypt(encryptedBuffer, password) {
        const buf    = Buffer.isBuffer(encryptedBuffer) ? encryptedBuffer : Buffer.from(encryptedBuffer);
        const salt   = buf.subarray(0, SALT_LENGTH);
        const iv     = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const ciphertext = buf.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const key    = this.deriveKey(password, salt);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
        decipher.setAuthTag(authTag);

        try {
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        } catch (err) {
            throw new Error('Decryption failed — incorrect password or corrupted data');
        }
    }

    /**
     * SHA-256 hash of a Buffer (matches frontend EncryptionService.computeHash)
     */
    computeHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Generate cryptographically secure random hex string
     */
    generateSecureId(length = 32) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }

    /**
     * Hash a password with bcrypt for storage verification
     * This lets the server verify the correct password was given for encrypted downloads
     * WITHOUT ever storing the actual password
     */
    async hashPassword(password) {
        return bcrypt.hash(password, 12);
    }

    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    /**
     * Shard a Buffer into 256KB chunks
     * Matches frontend generateShardManifest logic
     */
    shardBuffer(buffer, fileHash) {
        const shards    = [];
        const totalSize = buffer.length;
        const count     = Math.max(1, Math.ceil(totalSize / SHARD_SIZE));

        for (let i = 0; i < count; i++) {
            const start = i * SHARD_SIZE;
            const end   = Math.min(start + SHARD_SIZE, totalSize);
            const chunk = buffer.subarray(start, end);
            shards.push({
                index : i,
                id    : this.generateSecureId(20),
                size  : chunk.length,
                hash  : this.computeHash(chunk),
                data  : chunk,      // Buffer chunk for IPFS upload
                status: 'pending'
            });
        }

        return {
            shardCount   : count,
            shardSize    : SHARD_SIZE,
            algorithm    : 'AES-256-GCM',
            hashAlgorithm: 'SHA-256',
            integrityHash: fileHash,
            shards
        };
    }

    /**
     * Reassemble shards from an array of Buffers in order
     */
    reassembleShards(shardBuffers) {
        return Buffer.concat(shardBuffers);
    }

    /**
     * Verify integrity of a file buffer against its hash
     */
    verifyIntegrity(buffer, expectedHash) {
        const actual = this.computeHash(buffer);
        return actual === expectedHash;
    }
}

module.exports = new EncryptionService();