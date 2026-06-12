/**
 * APEXA VAULT — Logger
 * Developed by Hrishekesh Varma
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.json()
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
                })
            )
        }),
        new transports.File({
            filename: path.join(logDir, 'error.log'),
            level   : 'error',
            maxsize : 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        new transports.File({
            filename: path.join(logDir, 'apexa.log'),
            maxsize : 10 * 1024 * 1024,
            maxFiles: 10
        })
    ]
});

module.exports = logger;