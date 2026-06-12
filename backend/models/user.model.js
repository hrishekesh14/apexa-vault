/**
 * APEXA VAULT — User Model
 * Developed by Hrishekesh Varma
 *
 * Maps to frontend:
 *   localStorage 'apexa_users' → users collection
 *   { username, email, password } → hashed + JWT sessions
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type     : String,
        required : [true, 'Username is required'],
        trim     : true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        match    : [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, underscores']
    },
    email: {
        type    : String,
        required: [true, 'Email is required'],
        unique  : true,
        trim    : true,
        lowercase: true,
        match   : [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    // Bcrypt hash — NEVER store plaintext (fixes frontend's plaintext password storage)
    password: {
        type    : String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select  : false // Never returned in queries by default
    },
    // Storage quota tracking (mirrors frontend's 5GB limit)
    storageUsed: {
        type   : Number,
        default: 0     // bytes
    },
    storageQuota: {
        type   : Number,
        default: 5 * 1024 * 1024 * 1024 // 5GB in bytes
    },
    // Wallet address (set when user connects MetaMask/WalletConnect)
    walletAddress: {
        type  : String,
        default: null
    },
    walletProvider: {
        type: String,
        enum: ['metamask', 'walletconnect', 'coinbase', null],
        default: null
    },
    // Account flags
    isActive : { type: Boolean, default: true },
    lastLogin: { type: Date },
    // Refresh token for JWT rotation
    refreshToken: {
        type  : String,
        select: false
    }
}, {
    timestamps: true
});

// ── Pre-save: Hash password ──────────────────────────────────────
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt   = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// ── Method: Compare password ─────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// ── Method: Storage remaining ─────────────────────────────────────
userSchema.methods.storageRemaining = function () {
    return this.storageQuota - this.storageUsed;
};

// ── Method: Storage percentage ───────────────────────────────────
userSchema.methods.storagePercentage = function () {
    return Math.min((this.storageUsed / this.storageQuota) * 100, 100);
};

// ── Virtual: Safe user object (no password) ──────────────────────
userSchema.methods.toSafeObject = function () {
    return {
        id           : this._id,
        username     : this.username,
        email        : this.email,
        storageUsed  : this.storageUsed,
        storageQuota : this.storageQuota,
        walletAddress: this.walletAddress,
        walletProvider: this.walletProvider,
        isActive     : this.isActive,
        lastLogin    : this.lastLogin,
        createdAt    : this.createdAt
    };
};

module.exports = mongoose.model('User', userSchema);