/**
 * APEXA VAULT — JWT Authentication Middleware
 * Developed by Hrishekesh Varma
 */

'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/user.model');

/**
 * Protect routes — verifies Bearer JWT from Authorization header
 * Frontend sends: Authorization: Bearer <token>  (from localStorage 'apexa_token')
 */
const protect = async (req, res, next) => {
    try {
        let token;

        // Extract Bearer token
        if (req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Please sign in.'
            });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Session expired. Please sign in again.',
                    code   : 'TOKEN_EXPIRED'
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please sign in.'
            });
        }

        // Fetch user (ensures account still exists and is active)
        const user = await User.findById(decoded.id).select('+refreshToken');
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account not found or deactivated.'
            });
        }

        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Generate JWT access token
 */
const generateAccessToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

/**
 * Generate JWT refresh token
 */
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
};

module.exports = { protect, generateAccessToken, generateRefreshToken };
