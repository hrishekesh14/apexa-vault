/**
 * APEXA VAULT — API Response Helpers
 * Developed by Hrishekesh Varma
 *
 * ISSUE 8 FIX:
 * Standardized response format used across all controllers.
 *
 * Success: { success: true,  message: "...", data: {} }
 * Error:   { success: false, message: "...", error: "..." }
 *
 * Usage:
 *   const { ok, fail, created } = require('../utils/response');
 *   ok(res, { files }, 'Files retrieved');
 *   fail(res, 'File not found', 404);
 */

'use strict';

/**
 * 200 OK — general success
 */
const ok = (res, data = {}, message = 'Success') => {
    return res.status(200).json({
        success: true,
        message,
        data
    });
};

/**
 * 201 Created — resource created successfully
 */
const created = (res, data = {}, message = 'Created successfully') => {
    return res.status(201).json({
        success: true,
        message,
        data
    });
};

/**
 * Error response — defaults to 500
 */
const fail = (res, message = 'Internal Server Error', statusCode = 500, error = null) => {
    const body = {
        success: false,
        message
    };
    if (error && process.env.NODE_ENV === 'development') {
        body.error = typeof error === 'string' ? error : error.message || String(error);
    }
    return res.status(statusCode).json(body);
};

/**
 * 400 Bad Request
 */
const badRequest = (res, message = 'Bad request', error = null) => {
    return fail(res, message, 400, error);
};

/**
 * 401 Unauthorized
 */
const unauthorized = (res, message = 'Unauthorized') => {
    return fail(res, message, 401);
};

/**
 * 404 Not Found
 */
const notFound = (res, message = 'Resource not found') => {
    return fail(res, message, 404);
};

/**
 * 409 Conflict
 */
const conflict = (res, message = 'Resource already exists') => {
    return fail(res, message, 409);
};

/**
 * 413 Payload Too Large
 */
const tooLarge = (res, message = 'Payload too large') => {
    return fail(res, message, 413);
};

module.exports = { ok, created, fail, badRequest, unauthorized, notFound, conflict, tooLarge };