'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const config = {
  env: nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 5000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/apexa_vault',
  jwtSecret: process.env.JWT_SECRET || 'development-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '',
  pinataApiKey: process.env.PINATA_API_KEY || '',
  pinataApiSecret: process.env.PINATA_API_SECRET || '',
  pinataJwt: process.env.PINATA_JWT || '',
  pinataGateway: process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/',
  ipfsProvider: process.env.IPFS_PROVIDER || 'pinata',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  logLevel: process.env.LOG_LEVEL || 'info',
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 100),
  maxFilesPerUpload: Number(process.env.MAX_FILES_PER_UPLOAD || 10),
};

module.exports = config;
