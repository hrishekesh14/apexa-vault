/**
 * APEXA VAULT — Auth Controller
 * Developed by Hrishekesh Varma
 *
 * Replaces frontend localStorage auth with:
 *   - Bcrypt password hashing
 *   - JWT access + refresh tokens
 *   - MongoDB user storage
 *
 * API mirrors exactly what the frontend sends from:
 *   registerForm.submit → POST /api/auth/register
 *   loginForm.submit    → POST /api/auth/login
 */

'use strict';

const User     = require('../models/user.model');
const Activity = require('../models/activity.model');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth.middleware');
const logger   = require('../utils/logger');
const config   = require('../config/config');
const jwt      = require('jsonwebtoken');

/**
 * POST /api/auth/register
 * Body: { username, email, password, confirmPassword }
 * Matches frontend registerForm fields exactly
 */
const register = async (req, res, next) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // Validation (mirrors frontend validation)
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please fill in all fields' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        // Check duplicate email
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists' });
        }

        // Create user — bcrypt hash applied in pre-save hook
        const user = await User.create({ username, email, password });

        // Log activity
        await Activity.create({
            owner : user._id,
            type  : 'auth',
            detail: 'Account created successfully',
            ipAddress: req.ip
        });

        logger.info(`New user registered: ${email}`);

        res.status(201).json({
            success : true,
            message : 'Account created successfully'
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, refreshToken, user }
 * Frontend stores token as 'apexa_token' and user as 'apexa_current_user'
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please enter both email and password' });
        }

        // Fetch user including password field
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({ success: false, message: 'Account not found' });
        }

        if (!user.isActive) {
            return res.status(401).json({ success: false, message: 'Account is deactivated' });
        }

        // Bcrypt compare (replaces frontend's plaintext === check)
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }

        // Generate tokens
        const accessToken  = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Store refresh token hash (not the token itself)
        user.refreshToken = refreshToken;
        user.lastLogin    = new Date();
        await user.save();

        // Log activity
        await Activity.create({
            owner : user._id,
            type  : 'auth',
            detail: 'Signed in successfully',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        logger.info(`User logged in: ${email}`);

        res.json({
            success     : true,
            message     : `Welcome back, ${user.username}!`,
            token       : accessToken,
            refreshToken,
            // Session data — matches frontend 'apexa_current_user' localStorage shape
            user: {
                id           : user._id,
                username     : user.username,
                email        : user.email,
                storageUsed  : user.storageUsed,
                storageQuota : user.storageQuota,
                walletAddress: user.walletAddress,
                loginTime    : new Date().toISOString()
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Returns new accessToken
 */
const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
        } catch {
            return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
        }

        const user = await User.findById(decoded.id).select('+refreshToken');
        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token mismatch' });
        }

        const newAccessToken  = generateAccessToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        user.refreshToken = newRefreshToken;
        await user.save();

        res.json({ success: true, token: newAccessToken, refreshToken: newRefreshToken });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/logout
 * Clears refresh token
 */
const logout = async (req, res, next) => {
    try {
        let user = req.user;

        if (!user) {
            const { refreshToken } = req.body || {};
            if (!refreshToken) {
                return res.status(400).json({ success: false, message: 'Refresh token required' });
            }
            user = await User.findOne({ refreshToken });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.refreshToken = null;
        await user.save();

        await Activity.create({
            owner : user._id,
            type  : 'auth',
            detail: 'Signed out',
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Signed out successfully' });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/auth/me
 * Returns current user profile
 */
const getMe = async (req, res) => {
    res.json({ success: true, user: req.user.toSafeObject() });
};

module.exports = { register, login, refresh, logout, getMe };