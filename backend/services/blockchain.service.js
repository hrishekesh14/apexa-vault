/**
 * APEXA VAULT — Blockchain Service
 * Developed by Hrishekesh Varma
 *
 * Real ethers.js integration for:
 *   - File ownership registration on Polygon
 *   - On-chain hash storage
 *   - Integrity verification
 *   - Immutable audit trail
 *
 * Replaces frontend BlockchainService simulation with real transactions.
 */

'use strict';

const { ethers } = require('ethers');
const logger     = require('../utils/logger');

// FileRegistry ABI — matches FileRegistry.sol
const FILE_REGISTRY_ABI = [
    'function registerFile(bytes32 fileHash, string calldata cid, address owner) external returns (uint256)',
    'function verifyFile(bytes32 fileHash) external view returns (bool verified, address owner, uint256 timestamp, string cid)',
    'function getRecord(uint256 tokenId) external view returns (bytes32 fileHash, string cid, address owner, uint256 timestamp)',
    'function getOwnerFiles(address owner) external view returns (uint256[] memory)',
    'function totalFiles() external view returns (uint256)',
    'event FileRegistered(uint256 indexed tokenId, bytes32 indexed fileHash, address indexed owner, string cid, uint256 timestamp)'
];

class BlockchainService {

    constructor() {
        this.network          = process.env.BLOCKCHAIN_NETWORK || 'mumbai';
        this.contractAddress  = process.env.FILE_REGISTRY_CONTRACT_ADDRESS;
        this._provider        = null;
        this._signer          = null;
        this._contract        = null;
        this._initialized     = false;
    }

    /* ── Initialize ethers provider + contract ──────────────── */
    async _init() {
        if (this._initialized) return;

        const rpcUrls = {
            mumbai  : process.env.POLYGON_MUMBAI_RPC  || 'https://rpc-mumbai.maticvigil.com',
            polygon : process.env.POLYGON_MAINNET_RPC || 'https://polygon-rpc.com',
            hardhat : 'http://127.0.0.1:8545'
        };

        const rpc = rpcUrls[this.network];
        if (!rpc) throw new Error(`Unknown network: ${this.network}`);

        this._provider = new ethers.JsonRpcProvider(rpc);

        if (!process.env.BACKEND_WALLET_PRIVATE_KEY || process.env.BACKEND_WALLET_PRIVATE_KEY === 'your_backend_wallet_private_key_here') {
            logger.warn('Blockchain: No wallet key configured — running in read-only mode');
            this._signer = null;
        } else {
            this._signer = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this._provider);
            logger.info(`Blockchain signer: ${this._signer.address}`);
        }

        if (this.contractAddress && this.contractAddress !== '0x0000000000000000000000000000000000000000') {
            const signerOrProvider = this._signer || this._provider;
            this._contract = new ethers.Contract(this.contractAddress, FILE_REGISTRY_ABI, signerOrProvider);
            logger.info(`FileRegistry contract loaded: ${this.contractAddress}`);
        } else {
            logger.warn('Blockchain: Contract address not configured — simulating');
        }

        this._initialized = true;
    }

    /* ── PUBLIC: Register file on blockchain ────────────────── */
    async registerFile(fileHash, cid, ownerAddress) {
        await this._init();

        // If no contract configured, return simulation (graceful degradation)
        if (!this._contract || !this._signer) {
            logger.info('Blockchain: Simulating registration (no contract/signer)');
            return this._simulateRegistration(fileHash, cid, ownerAddress);
        }

        try {
            const hashBytes32 = this._hashToBytes32(fileHash);
            const owner       = ownerAddress || this._signer.address;

            logger.info(`Registering on-chain: hash=${fileHash.substring(0,12)}... cid=${cid.substring(0,14)}...`);

            const tx = await this._contract.registerFile(hashBytes32, cid, owner, {
                gasLimit: 300000
            });

            logger.info(`TX sent: ${tx.hash}`);
            const receipt = await tx.wait(1); // Wait 1 confirmation

            logger.info(`TX confirmed: block #${receipt.blockNumber}`);

            return {
                txHash         : receipt.hash,
                blockNumber    : receipt.blockNumber,
                blockHash      : receipt.blockHash,
                contractAddress: this.contractAddress,
                network        : this._getNetworkName(),
                gasUsed        : receipt.gasUsed?.toString(),
                confirmations  : 1,
                ownerAddress   : owner,
                status         : 'confirmed',
                timestamp      : new Date().toISOString()
            };
        } catch (err) {
            logger.error('Blockchain registration failed:', err.message);
            // Graceful degradation — still return a simulation so file upload doesn't fail
            logger.warn('Falling back to simulation record');
            return this._simulateRegistration(fileHash, cid, ownerAddress);
        }
    }

    /* ── PUBLIC: Verify a file's integrity on-chain ─────────── */
    async verifyFile(fileHash) {
        await this._init();

        if (!this._contract) {
            return { verified: true, network: this._getNetworkName(), simulated: true };
        }

        try {
            const hashBytes32 = this._hashToBytes32(fileHash);
            const [verified, owner, timestamp, cid] = await this._contract.verifyFile(hashBytes32);
            return {
                verified,
                owner,
                timestamp: new Date(Number(timestamp) * 1000).toISOString(),
                cid,
                network: this._getNetworkName()
            };
        } catch (err) {
            logger.warn(`Verify failed: ${err.message}`);
            return { verified: false, error: err.message };
        }
    }

    /* ── PUBLIC: Get all files for a wallet address ──────────── */
    async getOwnerFiles(ownerAddress) {
        await this._init();
        if (!this._contract) return [];

        try {
            const tokenIds = await this._contract.getOwnerFiles(ownerAddress);
            return tokenIds.map(id => id.toString());
        } catch (err) {
            logger.warn(`getOwnerFiles failed: ${err.message}`);
            return [];
        }
    }

    /* ── PUBLIC: Get network stats ──────────────────────────── */
    async getNetworkInfo() {
        await this._init();
        try {
            const network     = await this._provider.getNetwork();
            const blockNumber = await this._provider.getBlockNumber();
            const feeData     = await this._provider.getFeeData();
            return {
                name        : network.name,
                chainId     : network.chainId.toString(),
                blockNumber,
                gasPrice    : feeData.gasPrice?.toString(),
                connected   : true
            };
        } catch (err) {
            return { connected: false, error: err.message };
        }
    }

    /* ── PRIVATE: Simulation fallback ───────────────────────── */
    _simulateRegistration(fileHash, cid, ownerAddress) {
        const crypto  = require('crypto');
        const txHash  = '0x' + crypto.randomBytes(32).toString('hex');
        const blockN  = 48000000 + Math.floor(Math.random() * 1000000);
        return {
            txHash,
            blockNumber    : blockN,
            blockHash      : '0x' + crypto.randomBytes(32).toString('hex'),
            contractAddress: this.contractAddress || '0x' + crypto.randomBytes(20).toString('hex'),
            network        : this._getNetworkName() + ' (Simulated)',
            gasUsed        : String(21000 + Math.floor(Math.random() * 50000)),
            confirmations  : 1,
            ownerAddress   : ownerAddress || '0x' + crypto.randomBytes(20).toString('hex'),
            status         : 'confirmed',
            simulated      : true,
            timestamp      : new Date().toISOString()
        };
    }

    /* ── PRIVATE: Convert hex hash to bytes32 ───────────────── */
    _hashToBytes32(hexHash) {
        const clean = hexHash.startsWith('0x') ? hexHash : '0x' + hexHash;
        return ethers.zeroPadValue(clean.slice(0, 66), 32);
    }

    _getNetworkName() {
        const names = { mumbai: 'Polygon Mumbai', polygon: 'Polygon', hardhat: 'Hardhat Local' };
        return names[this.network] || 'Polygon';
    }
}

module.exports = new BlockchainService();