/**
 * APEXA VAULT — MongoDB Connection
 * Developed by Hrishekesh Varma
 */

'use strict';

const mongoose = require('mongoose');
const logger   = require('../utils/logger');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not defined in environment variables');
    }

    mongoose.connection.on('connected', () => {
        logger.info('MongoDB connection established');
    });

    mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected — attempting reconnect...');
    });

    mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
    });

    await mongoose.connect(uri, {
        maxPoolSize      : 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS  : 45000
    });
};

module.exports = connectDB;