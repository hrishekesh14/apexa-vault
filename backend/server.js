/**
 * APEXA VAULT — Main Server
 * Developed by Hrishekesh Varma
 */

'use strict';

require('dotenv').config();
const validateEnv = require('./config/env');
validateEnv();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB    = require('./config/database');
const logger       = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// ── Routes ──────────────────────────────────────────────────────
const authRoutes       = require('./routes/auth.routes');
const fileRoutes       = require('./routes/file.routes');
const ipfsRoutes       = require('./routes/ipfs.routes');
const blockchainRoutes = require('./routes/blockchain.routes');
const userRoutes       = require('./routes/user.routes');

const app  = express();
const PORT = process.env.PORT || 5000;

/* =========================================================
   🔥 BODY PARSING MIDDLEWARE (IMPORTANT FIX ADDED HERE)
   ========================================================= */

// This is what was missing in your setup
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Security Middleware ──────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ── Rate Limiting ────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs : parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max      : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message  : { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs : 15 * 60 * 1000,
    max      : 10,
    message  : { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' }
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ── Sanitization + Compression ───────────────────────────────────
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(compression());

// ── Logging ──────────────────────────────────────────────────────
app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
}));

// ── Health Check ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status : 'operational',
        service: 'APEXA VAULT API',
        version: '1.0.0',
        author : 'Hrishekesh Varma',
        timestamp: new Date().toISOString()
    });
});

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/files',      fileRoutes);
app.use('/api/ipfs',       ipfsRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/user',       userRoutes);

// ── 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// ── Global Error Handler ─────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            logger.info(`
╔══════════════════════════════════════════════════════════╗
║           APEXA VAULT — Backend Server                  ║
║           Developed by Hrishekesh Varma                 ║
╠══════════════════════════════════════════════════════════╣
║  Server   : http://localhost:${PORT}                       ║
║  Env      : ${(process.env.NODE_ENV || 'development').padEnd(42)}║
║  MongoDB  : Connected                                   ║
╚══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        logger.error('Server startup failed:', err);
        process.exit(1);
    }
};

startServer();

module.exports = app; // for testing