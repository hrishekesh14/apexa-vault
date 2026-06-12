/**
 * APEXA VAULT — IPFS Controller
 * Developed by Hrishekesh Varma
 */

'use strict';

const ipfsService = require('../services/ipfs.service');
const File        = require('../models/file.model');

/**
 * GET /api/ipfs/status
 * Tests IPFS provider connectivity
 */
const getStatus = async (req, res, next) => {
    try {
        const status = await ipfsService.testConnection();
        res.json({ success: true, ...status });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/ipfs/:cid
 * Proxy-retrieve a file by CID from IPFS (authenticated)
 */
const getByCID = async (req, res, next) => {
    try {
        const { cid } = req.params;

        // Verify the CID belongs to this user
        const file = await File.findOne({
            ipfsCID  : cid,
            owner    : req.user._id,
            isDeleted: false
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'CID not found or access denied'
            });
        }

        const buffer = await ipfsService.retrieve(cid);

        res.set({
            'Content-Type'       : file.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="encrypted_${file.originalName}"`,
            'Content-Length'     : buffer.length
        });

        res.send(buffer);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/ipfs/files/list
 * List CIDs pinned for this user
 */
const listPinned = async (req, res, next) => {
    try {
        const files = await File.find({
            owner    : req.user._id,
            isDeleted: false,
            ipfsCID  : { $exists: true, $ne: null }
        }).select('name ipfsCID ipfsProvider ipfsReplication ipfsPinnedAt sizeInBytes').lean();

        res.json({
            success: true,
            pins   : files.map(f => ({
                name       : f.name,
                cid        : f.ipfsCID,
                provider   : f.ipfsProvider,
                replication: f.ipfsReplication,
                pinnedAt   : f.ipfsPinnedAt,
                size       : f.sizeInBytes
            }))
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getStatus, getByCID, listPinned };