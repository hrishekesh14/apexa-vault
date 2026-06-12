/**
 * APEXA VAULT — File Model
 * Developed by Hrishekesh Varma
 *
 * Maps to frontend localStorage:
 *   apexa_files_{email} array items → files collection
 *   All fields from app.js processUpload() are represented here
 */

'use strict';

const mongoose = require('mongoose');

// Shard sub-document (matches app.js generateShardManifest)
const shardSchema = new mongoose.Schema({
    index : { type: Number, required: true },
    id    : { type: String, required: true },
    size  : { type: Number, default: 0 },
    hash  : { type: String },
    status: {
        type   : String,
        enum   : ['pending', 'uploaded', 'pinned', 'failed'],
        default: 'pending'
    }
}, { _id: false });

// Blockchain record sub-document (matches app.js BlockchainService._simulateRegistration)
const blockchainRecordSchema = new mongoose.Schema({
    txHash         : { type: String },
    blockNumber    : { type: Number },
    blockHash      : { type: String },
    contractAddress: { type: String },
    network        : { type: String, default: 'Polygon (MATIC)' },
    gasUsed        : { type: String },
    confirmations  : { type: Number, default: 1 },
    ownerAddress   : { type: String },
    status         : {
        type   : String,
        enum   : ['pending', 'confirmed', 'failed'],
        default: 'pending'
    },
    registeredAt: { type: Date, default: Date.now }
}, { _id: false });

const fileSchema = new mongoose.Schema({
    // ── Owner reference (replaces localStorage email key) ──────
    owner: {
        type    : mongoose.Schema.Types.ObjectId,
        ref     : 'User',
        required: true,
        index   : true
    },

    // ── Core file metadata (matches frontend file object) ──────
    name       : { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    size       : { type: String },              // "1.5 KB" display string
    sizeInBytes: { type: Number, required: true },
    mimeType   : { type: String, default: 'application/octet-stream' },
    type       : { type: String },              // extension without dot
    date       : { type: String },              // "Jan 5, 2025" display string

    // ── Encryption metadata ─────────────────────────────────────
    encrypted     : { type: Boolean, default: false },
    // NEVER store decryption password — client holds it
    encryptionAlgo: { type: String, default: 'AES-256-GCM' },
    // Server-stored salt for password verification only (not for decryption)
    // The actual encryption happens client-side; this verifies correct password
    passwordHash  : { type: String, select: false },

    // ── Integrity ───────────────────────────────────────────────
    integrityHash : { type: String },  // SHA-256 of original file
    encryptedHash : { type: String },  // SHA-256 of encrypted blob

    // ── Shard manifest (matches app.js shardManifest) ──────────
    shardManifest: {
        shardCount    : { type: Number, default: 1 },
        shardSize     : { type: Number, default: 256 * 1024 },
        algorithm     : { type: String, default: 'AES-256-GCM' },
        hashAlgorithm : { type: String, default: 'SHA-256' },
        integrityHash : { type: String },
        shards        : [shardSchema]
    },

    // ── IPFS data (matches app.js IPFSService result) ──────────
    ipfsCID        : { type: String, },
    ipfsUrl        : { type: String },
    ipfsProvider   : { type: String, default: 'Pinata' },
    ipfsReplication: { type: Number, default: 3 },
    ipfsPinnedAt   : { type: Date },

    // ── Blockchain data (matches app.js blockchainRecord) ───────
    blockchainRecord: blockchainRecordSchema,

    // ── Status flags ────────────────────────────────────────────
    status: {
        type   : String,
        enum   : ['processing', 'uploaded', 'encrypted', 'pinned', 'verified', 'failed'],
        default: 'processing'
    },
    isDeleted  : { type: Boolean, default: false },
    deletedAt  : { type: Date, default: null },

    uploadedAt : { type: Date, default: Date.now }
}, {
    timestamps: true
});

// ── Indexes for performance ──────────────────────────────────────
fileSchema.index({ owner: 1, isDeleted: 1 });
fileSchema.index({ owner: 1, createdAt: -1 });
fileSchema.index({ ipfsCID: 1 });
fileSchema.index({ 'blockchainRecord.txHash': 1 });

// ── Soft delete ──────────────────────────────────────────────────
fileSchema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

// ── Query helper: active files only ─────────────────────────────
fileSchema.statics.findActive = function (query = {}) {
    return this.find({ ...query, isDeleted: false });
};

module.exports = mongoose.model('File', fileSchema);