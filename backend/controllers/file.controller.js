/**
 * APEXA VAULT — File Controller
 * Developed by Hrishekesh Varma
 *
 * Implements the backend side of frontend processUpload() from app.js:
 *
 *   Frontend flow:                  Backend mirror:
 *   ──────────────────────────────────────────────────────
 *   1. Read file arrayBuffer     →  multer gives req.files[]
 *   2. computeHash               →  encryption.computeHash()
 *   3. encrypt (AES-256-GCM)     →  encryption.encrypt() (server-side)
 *   4. generateShardManifest     →  encryption.shardBuffer()
 *   5. IPFSService.upload        →  ipfs.upload()
 *   6. BlockchainService.register →  blockchain.registerFile()
 *   7. Save to localStorage      →  Save to MongoDB File model
 *   8. Update activity log       →  Activity model insert
 *   9. Update storage UI         →  User.storageUsed update
 */

'use strict';

const File             = require('../models/file.model');
const User             = require('../models/user.model');
const Activity         = require('../models/activity.model');
const encryptionService = require('../services/encryption.service');
const ipfsService = require('../services/ipfs.service');
const blockchainService = require('../services/blockchain.service');
const logger           = require('../utils/logger');

/**
 * POST /api/files/upload
 *
 * Accepts multipart/form-data:
 *   files[]         — one or more files (from dropZone)
 *   encrypt         — "true" | "false" (from encryptToggle)
 *   encryptionPassword — password (from encryptionPassword input)
 *
 * This is the real backend equivalent of frontend processUpload()
 */
const uploadFiles = async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files provided' });
        }

        const user       = req.user;
        const doEncrypt  = req.body.encrypt === 'true';
        const password   = req.body.encryptionPassword || null;

        if (doEncrypt && !password) {
            return res.status(400).json({ success: false, message: 'Encryption password is required' });
        }

        // Check storage quota
        const totalIncoming = req.files.reduce((sum, f) => sum + f.size, 0);
        if (user.storageUsed + totalIncoming > user.storageQuota) {
            return res.status(413).json({
                success: false,
                message: 'Storage quota exceeded'
            });
        }

        const results = [];
        const errors  = [];

        for (const multerFile of req.files) {
            try {
                logger.info(`Processing upload: ${multerFile.originalname} (${multerFile.size} bytes)`);

                // ── Step 1: Compute integrity hash of original ──────────
                const originalBuffer = multerFile.buffer;
                const integrityHash  = encryptionService.computeHash(originalBuffer);

                // ── Step 2: Encrypt if requested ─────────────────────────
                let uploadBuffer = originalBuffer;
                let passwordHash = null;

                if (doEncrypt) {
                    uploadBuffer = encryptionService.encrypt(originalBuffer, password);
                    // Store bcrypt hash of password for verification (NOT the password itself)
                    passwordHash = await encryptionService.hashPassword(password);
                    logger.info(`File encrypted: ${multerFile.originalname}`);
                }

                const encryptedHash = encryptionService.computeHash(uploadBuffer);

                // ── Step 3: Generate shard manifest ──────────────────────
                const shardManifest = encryptionService.shardBuffer(uploadBuffer, integrityHash);
                // Strip the binary data from shards before saving to DB
                const shardsMeta = shardManifest.shards.map(s => ({
                    index : s.index,
                    id    : s.id,
                    size  : s.size,
                    hash  : s.hash,
                    status: 'uploaded'
                }));

                // ── Step 4: Upload to IPFS ────────────────────────────────
                logger.info(`Uploading to IPFS: ${multerFile.originalname}`);
                const ipfsResult = await ipfsService.upload(
                    uploadBuffer,
                    multerFile.originalname,
                    { userId: user._id.toString(), encrypted: doEncrypt.toString() }
                );
                logger.info(`IPFS success: CID=${ipfsResult.cid}`);

                // ── Step 5: Register on blockchain ────────────────────────
                logger.info(`Registering on blockchain: ${multerFile.originalname}`);
                const blockchainRecord = await blockchainService.registerFile(
                    integrityHash,
                    ipfsResult.cid,
                    user.walletAddress
                );
                logger.info(`Blockchain: tx=${blockchainRecord.txHash?.substring(0, 14)}...`);

                // ── Step 6: Build display strings (match frontend) ────────
                const size    = ipfsService.formatSize(multerFile.size);
                const typeStr = multerFile.mimetype.split('/')[1] || 'binary';
                const dateStr = new Date().toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                });

                // ── Step 7: Save to MongoDB ───────────────────────────────
                const fileDoc = await File.create({
                    owner        : user._id,
                    name         : multerFile.originalname,
                    originalName : multerFile.originalname,
                    size,
                    sizeInBytes  : multerFile.size,
                    mimeType     : multerFile.mimetype,
                    type         : typeStr,
                    date         : dateStr,
                    encrypted    : doEncrypt,
                    passwordHash : doEncrypt ? passwordHash : undefined,
                    integrityHash,
                    encryptedHash,
                    shardManifest: {
                        shardCount   : shardManifest.shardCount,
                        shardSize    : shardManifest.shardSize,
                        algorithm    : shardManifest.algorithm,
                        hashAlgorithm: shardManifest.hashAlgorithm,
                        integrityHash: shardManifest.integrityHash,
                        shards       : shardsMeta
                    },
                    ipfsCID        : ipfsResult.cid,
                    ipfsUrl        : ipfsResult.url,
                    ipfsProvider   : ipfsResult.provider,
                    ipfsReplication: ipfsResult.replicationFactor,
                    ipfsPinnedAt   : ipfsResult.pinnedAt ? new Date(ipfsResult.pinnedAt) : new Date(),
                    blockchainRecord: {
                        txHash         : blockchainRecord.txHash,
                        blockNumber    : blockchainRecord.blockNumber,
                        blockHash      : blockchainRecord.blockHash,
                        contractAddress: blockchainRecord.contractAddress,
                        network        : blockchainRecord.network,
                        gasUsed        : blockchainRecord.gasUsed,
                        confirmations  : blockchainRecord.confirmations,
                        ownerAddress   : blockchainRecord.ownerAddress,
                        status         : blockchainRecord.status,
                        registeredAt   : new Date()
                    },
                    status: 'verified',
                    uploadedAt: new Date()
                });

                // ── Step 8: Update user storage ───────────────────────────
                await User.findByIdAndUpdate(user._id, {
                    $inc: { storageUsed: multerFile.size }
                });

                // ── Step 9: Log activity ──────────────────────────────────
                const activityType   = doEncrypt ? 'security' : 'upload';
                const activityDetail = doEncrypt
                    ? `AES-256 encrypted "${multerFile.originalname}" → IPFS + Polygon`
                    : `Uploaded "${multerFile.originalname}" → IPFS`;

                await Activity.create({
                    owner   : user._id,
                    type    : activityType,
                    detail  : activityDetail,
                    fileRef : fileDoc._id,
                    ipAddress: req.ip,
                    metadata: { cid: ipfsResult.cid, encrypted: doEncrypt }
                });

                await Activity.create({
                    owner : user._id,
                    type  : 'blockchain',
                    detail: `Blockchain record created: tx ${blockchainRecord.txHash?.substring(0,14)}...`,
                    fileRef: fileDoc._id,
                    metadata: { txHash: blockchainRecord.txHash }
                });

                await Activity.create({
                    owner : user._id,
                    type  : 'ipfs',
                    detail: `IPFS CID registered: ${ipfsResult.cid?.substring(0,20)}...`,
                    fileRef: fileDoc._id,
                    metadata: { cid: ipfsResult.cid }
                });

                // Build response object that matches frontend file shape
                results.push({
                    id             : fileDoc._id,
                    name           : fileDoc.name,
                    size           : fileDoc.size,
                    sizeInBytes    : fileDoc.sizeInBytes,
                    type           : fileDoc.type,
                    date           : fileDoc.date,
                    encrypted      : fileDoc.encrypted,
                    ipfsCID        : fileDoc.ipfsCID,
                    ipfsUrl        : fileDoc.ipfsUrl,
                    ipfsProvider   : fileDoc.ipfsProvider,
                    ipfsReplication: fileDoc.ipfsReplication,
                    blockchainRecord: fileDoc.blockchainRecord,
                    integrityHash  : fileDoc.integrityHash,
                    shardManifest  : {
                        shardCount : fileDoc.shardManifest.shardCount,
                        shardSize  : fileDoc.shardManifest.shardSize,
                        algorithm  : fileDoc.shardManifest.algorithm
                    },
                    uploadedAt: fileDoc.uploadedAt,
                    status    : fileDoc.status
                });

                logger.info(`Upload complete: ${multerFile.originalname} | CID: ${ipfsResult.cid}`);
            } catch (fileErr) {
                logger.error(`File processing error for ${multerFile.originalname}:`, fileErr.message);
                errors.push({ file: multerFile.originalname, error: fileErr.message });
            }
        }

        const updatedUser = await User.findById(user._id);
        const storageInfo = {
            storageUsed  : updatedUser.storageUsed,
            storageQuota : updatedUser.storageQuota,
            percentage   : updatedUser.storagePercentage()
        };

        res.status(201).json({
            success    : true,
            message    : `${results.length} file(s) uploaded successfully`,
            files      : results,
            errors     : errors.length > 0 ? errors : undefined,
            storageInfo
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/files
 * Returns all active files for the authenticated user
 * Matches frontend renderRecentFiles() data requirements
 */
const getFiles = async (req, res, next) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip  = (page - 1) * limit;

        const files = await File.find({ owner: req.user._id, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await File.countDocuments({ owner: req.user._id, isDeleted: false });

        // Shape response to match frontend localStorage file object exactly
        const shapedFiles = files.map(f => ({
            id             : f._id,
            name           : f.name,
            size           : f.size,
            sizeInBytes    : f.sizeInBytes,
            type           : f.type,
            date           : f.date,
            encrypted      : f.encrypted,
            ipfsCID        : f.ipfsCID,
            ipfsUrl        : f.ipfsUrl,
            ipfsProvider   : f.ipfsProvider,
            ipfsReplication: f.ipfsReplication,
            blockchainRecord: f.blockchainRecord,
            integrityHash  : f.integrityHash,
            shardManifest  : f.shardManifest
                ? { shardCount: f.shardManifest.shardCount, algorithm: f.shardManifest.algorithm }
                : null,
            status    : f.status,
            uploadedAt: f.uploadedAt
        }));

        res.json({
            success: true,
            files  : shapedFiles,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/files/decrypt-download
 * Body: { fileId, password }
 *
 * Validates password, fetches from IPFS, decrypts, returns binary
 * Replaces frontend showDecryptionModal + performDownload
 */
const decryptDownload = async (req, res, next) => {
    try {
        const { fileId, password } = req.body;

        if (!fileId || !password) {
            return res.status(400).json({ success: false, message: 'fileId and password are required' });
        }

        const file = await File.findOne({
            _id      : fileId,
            owner    : req.user._id,
            isDeleted: false
        }).select('+passwordHash');

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (!file.encrypted) {
            return res.status(400).json({ success: false, message: 'File is not encrypted' });
        }

        // Verify password using bcrypt hash
        if (file.passwordHash) {
            const isCorrect = await encryptionService.verifyPassword(password, file.passwordHash);
            if (!isCorrect) {
                return res.status(401).json({ success: false, message: 'Incorrect decryption password' });
            }
        }

        // Fetch encrypted file from IPFS
        logger.info(`Fetching CID ${file.ipfsCID} from IPFS for decrypt`);
        const encryptedBuffer = await ipfsService.retrieve(file.ipfsCID);

        // Decrypt
        logger.info(`Decrypting: ${file.name}`);
        const decryptedBuffer = encryptionService.decrypt(encryptedBuffer, password);

        // Verify integrity
        const hash = encryptionService.computeHash(decryptedBuffer);
        if (file.integrityHash && hash !== file.integrityHash) {
            logger.warn(`Integrity mismatch for file ${fileId}`);
        }

        // Log download activity
        await Activity.create({
            owner : req.user._id,
            type  : 'download',
            detail: `Decrypted and downloaded "${file.name}"`,
            fileRef: file._id
        });

        // Stream decrypted file back
        res.set({
            'Content-Type'       : file.mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${file.originalName}"`,
            'Content-Length'     : decryptedBuffer.length
        });

        res.send(decryptedBuffer);
    } catch (err) {
        if (err.message.includes('Decryption failed')) {
            return res.status(401).json({ success: false, message: 'Incorrect decryption password' });
        }
        next(err);
    }
};

/**
 * GET /api/files/:id/download
 * Download unencrypted file directly from IPFS
 */
const downloadFile = async (req, res, next) => {
    try {
        const file = await File.findOne({
            _id      : req.params.id,
            owner    : req.user._id,
            isDeleted: false
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (file.encrypted) {
            return res.status(400).json({
                success: false,
                message: 'File is encrypted — use POST /api/files/decrypt-download'
            });
        }

        const fileBuffer = await ipfsService.retrieve(file.ipfsCID);

        await Activity.create({
            owner : req.user._id,
            type  : 'download',
            detail: `Downloaded "${file.name}"`,
            fileRef: file._id
        });

        res.set({
            'Content-Type'       : file.mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${file.originalName}"`,
            'Content-Length'     : fileBuffer.length
        });

        res.send(fileBuffer);
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/files/:id
 * Soft delete + unpin from IPFS
 * Matches frontend deleteFile() behavior
 */
const deleteFile = async (req, res, next) => {
    try {
        const file = await File.findOne({
            _id      : req.params.id,
            owner    : req.user._id,
            isDeleted: false
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        // Unpin from IPFS (best-effort)
        if (file.ipfsCID) {
            await ipfsService.unpin(file.ipfsCID);
        }

        // Soft delete
        await file.softDelete();

        // Reclaim storage
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { storageUsed: -file.sizeInBytes }
        });

        // Log activity
        await Activity.create({
            owner : req.user._id,
            type  : 'delete',
            detail: `File removed permanently: "${file.name}"`,
            fileRef: file._id
        });

        res.json({
            success: true,
            message: 'File removed from your secure storage'
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/files/:id
 * Get single file metadata
 */
const getFile = async (req, res, next) => {
    try {
        const file = await File.findOne({
            _id      : req.params.id,
            owner    : req.user._id,
            isDeleted: false
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        res.json({ success: true, file });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    uploadFiles,
    getFiles,
    decryptDownload,
    downloadFile,
    deleteFile,
    getFile
};