/**
 * APEXA VAULT — Activity Log Model
 * Developed by Hrishekesh Varma
 *
 * Maps to frontend: apexa_activity_{email} localStorage array
 */

'use strict';

const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    owner: {
        type    : mongoose.Schema.Types.ObjectId,
        ref     : 'User',
        required: true,
        index   : true
    },
    // Matches frontend activity types
    type: {
        type    : String,
        enum    : ['upload', 'delete', 'security', 'storage', 'blockchain', 'ipfs', 'auth', 'download'],
        required: true
    },
    detail   : { type: String, required: true },
    fileRef  : { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
    ipAddress: { type: String },
    userAgent: { type: String },
    metadata : { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true
});

activitySchema.index({ owner: 1, createdAt: -1 });

// Static: Get recent N activities for a user
activitySchema.statics.getRecent = function (userId, limit = 15) {
    return this.find({ owner: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

module.exports = mongoose.model('Activity', activitySchema);