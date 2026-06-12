/**
 * APEXA VAULT — User Controller
 * Developed by Hrishekesh Varma
 */

'use strict';

const User     = require('../models/user.model');
const Activity = require('../models/activity.model');
const File     = require('../models/file.model');

/**
 * GET /api/user/profile
 * Full profile including storage stats
 * Matches frontend updateStorageUI() data requirements
 */
const getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        const filesCount = await File.countDocuments({ owner: user._id, isDeleted: false });
        const encryptedCount = await File.countDocuments({ owner: user._id, isDeleted: false, encrypted: true });
        const chainCount = await File.countDocuments({
            owner    : user._id,
            isDeleted: false,
            'blockchainRecord.txHash': { $exists: true }
        });

        res.json({
            success: true,
            user   : {
                ...user.toSafeObject(),
                stats: {
                    totalFiles    : filesCount,
                    encryptedFiles: encryptedCount,
                    chainVerified : chainCount,
                    storageUsed   : user.storageUsed,
                    storageQuota  : user.storageQuota,
                    storagePercent: user.storagePercentage()
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/user/activity
 * Recent activity log — matches frontend renderActivityLog()
 */
const getActivity = async (req, res, next) => {
    try {
        const limit      = parseInt(req.query.limit) || 15;
        const activities = await Activity.getRecent(req.user._id, limit);

        // Shape to match frontend activity object exactly
        const shaped = activities.map(a => ({
            id    : a._id,
            type  : a.type,
            detail: a.detail,
            time  : a.createdAt.toISOString(),
            metadata: a.metadata
        }));

        res.json({ success: true, activities: shaped });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/user/storage
 * Storage breakdown — matches frontend updateStorageUI()
 */
const getStorage = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        const TOTAL = user.storageQuota;
        const used  = user.storageUsed;
        const usedGB = used / (1024 ** 3);
        const percent = Math.min((used / TOTAL) * 100, 100);

        let usedText;
        if (used < 1024)            usedText = `${used} B`;
        else if (used < 1024 ** 2)  usedText = `${(used / 1024).toFixed(1)} KB`;
        else if (used < 1024 ** 3)  usedText = `${(used / 1024 ** 2).toFixed(1)} MB`;
        else                         usedText = `${usedGB.toFixed(2)} GB`;

        res.json({
            success: true,
            storage: {
                usedBytes   : used,
                quotaBytes  : TOTAL,
                usedText,
                quotaText   : '5 GB',
                percentage  : percent,
                remaining   : TOTAL - used,
                remainingGB : (5 - usedGB).toFixed(2)
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PATCH /api/user/profile
 * Update username
 */
const updateProfile = async (req, res, next) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username required' });
        }

        req.user.username = username;
        await req.user.save();

        res.json({ success: true, user: req.user.toSafeObject() });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/user/account
 * Delete account and all files
 */
const deleteAccount = async (req, res, next) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user._id).select('+password');

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }

        // Soft-delete all files
        await File.updateMany({ owner: user._id }, { isDeleted: true, deletedAt: new Date() });

        // Deactivate account
        user.isActive = false;
        await user.save();

        res.json({ success: true, message: 'Account deactivated successfully' });
    } catch (err) {
        next(err);
    }
};

module.exports = { getProfile, getActivity, getStorage, updateProfile, deleteAccount };
