/**
 * APEXA VAULT — Blockchain Controller
 * Developed by Hrishekesh Varma
 */

'use strict';

const File             = require('../models/file.model');
const Activity         = require('../models/activity.model');
const blockchainService = require('../services/blockchain.service');
const logger           = require('../utils/logger');

/**
 * GET /api/blockchain/records
 * All chain records for this user (matches frontend BlockchainLedgerUI.render)
 */
const getRecords = async (req, res, next) => {
    try {
        const files = await File.find({
            owner    : req.user._id,
            isDeleted: false,
            'blockchainRecord.txHash': { $exists: true }
        }).sort({ createdAt: -1 }).limit(50).lean();

        const records = files.map(f => ({
            fileId      : f._id,
            fileName    : f.name,
            ipfsCID     : f.ipfsCID,
            txHash      : f.blockchainRecord?.txHash,
            blockNumber : f.blockchainRecord?.blockNumber,
            network     : f.blockchainRecord?.network,
            status      : f.blockchainRecord?.status,
            ownerAddress: f.blockchainRecord?.ownerAddress,
            registeredAt: f.blockchainRecord?.registeredAt,
            encrypted   : f.encrypted
        }));

        res.json({ success: true, records });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/blockchain/records/:fileId
 * Full blockchain record for a single file
 * Called when user clicks chain-verify button on file card
 */
const getRecord = async (req, res, next) => {
    try {
        const file = await File.findOne({
            _id      : req.params.fileId,
            owner    : req.user._id,
            isDeleted: false
        });

        if (!file || !file.blockchainRecord) {
            return res.status(404).json({ success: false, message: 'No blockchain record found' });
        }

        res.json({
            success: true,
            record : {
                fileId         : file._id,
                fileName       : file.name,
                ipfsCID        : file.ipfsCID,
                integrityHash  : file.integrityHash,
                encrypted      : file.encrypted,
                encryptionAlgo : file.encryptionAlgo,
                ...file.blockchainRecord.toObject()
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/blockchain/verify/:fileId
 * Re-verify a file's integrity against its on-chain record
 */
const verifyFile = async (req, res, next) => {
    try {
        const file = await File.findOne({
            _id      : req.params.fileId,
            owner    : req.user._id,
            isDeleted: false
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const result = await blockchainService.verifyFile(file.integrityHash);

        await Activity.create({
            owner : req.user._id,
            type  : 'blockchain',
            detail: `Verified on-chain record for "${file.name}"`,
            fileRef: file._id
        });

        res.json({
            success : true,
            verified: result.verified,
            details : result
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/blockchain/network
 * Current network info (block number, gas price)
 */
const getNetworkInfo = async (req, res, next) => {
    try {
        const info = await blockchainService.getNetworkInfo();
        res.json({ success: true, network: info });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/blockchain/wallet
 * Save/update wallet address for user
 */
const saveWallet = async (req, res, next) => {
    try {
        const { address, provider } = req.body;
        if (!address) {
            return res.status(400).json({ success: false, message: 'Wallet address required' });
        }

        req.user.walletAddress  = address;
        req.user.walletProvider = provider || 'metamask';
        await req.user.save();

        await Activity.create({
            owner : req.user._id,
            type  : 'security',
            detail: `Wallet connected: ${address.substring(0,10)}...`
        });

        res.json({
            success: true,
            message: 'Wallet address saved',
            wallet : { address, provider }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getRecords, getRecord, verifyFile, getNetworkInfo, saveWallet };