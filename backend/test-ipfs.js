'use strict';
require('dotenv').config();

const ipfsService = require('./services/ipfs.service');

(async () => {
    try {
        const result = await ipfsService.testConnection();
        console.log(result);
    } catch (err) {
        console.error(err);
    }
})();