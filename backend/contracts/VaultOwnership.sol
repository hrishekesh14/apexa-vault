// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VaultOwnership
 * @author Hrishekesh Varma
 * @notice APEXA VAULT — Vault-level ownership and access control
 *
 * Manages:
 *   - Vault creation per user
 *   - Storage tracking on-chain
 *   - Access grants for shared files
 *   - Vault integrity verification
 */
contract VaultOwnership {

    /* ══════════════════════════════════════════
       STRUCTS
    ══════════════════════════════════════════ */
    struct Vault {
        address owner;
        string  userId;          // Off-chain user ID (MongoDB _id)
        uint256 storageUsed;     // bytes
        uint256 storageQuota;    // bytes
        uint256 fileCount;
        uint256 createdAt;
        bool    exists;
    }

    struct AccessGrant {
        address grantee;
        uint256 tokenId;         // FileRegistry tokenId
        uint256 expiresAt;       // 0 = permanent
        bool    active;
    }

    /* ══════════════════════════════════════════
       STATE
    ══════════════════════════════════════════ */
    mapping(address => Vault) private _vaults;
    mapping(address => AccessGrant[]) private _grants;
    mapping(address => mapping(address => bool)) private _accessMap;

    address public immutable contractOwner;

    uint256 public constant DEFAULT_QUOTA = 5 * 1024 * 1024 * 1024; // 5GB

    /* ══════════════════════════════════════════
       EVENTS
    ══════════════════════════════════════════ */
    event VaultCreated(address indexed owner, string userId, uint256 quota);
    event StorageUpdated(address indexed owner, uint256 used, uint256 quota);
    event AccessGranted(address indexed owner, address indexed grantee, uint256 tokenId);
    event AccessRevoked(address indexed owner, address indexed grantee, uint256 tokenId);

    /* ══════════════════════════════════════════
       ERRORS
    ══════════════════════════════════════════ */
    error VaultAlreadyExists();
    error VaultNotFound();
    error StorageQuotaExceeded(uint256 used, uint256 quota);
    error Unauthorized();

    /* ══════════════════════════════════════════
       CONSTRUCTOR
    ══════════════════════════════════════════ */
    constructor() {
        contractOwner = msg.sender;
    }

    /* ══════════════════════════════════════════
       WRITE FUNCTIONS
    ══════════════════════════════════════════ */

    /**
     * @notice Create a vault for the caller
     * @param userId Off-chain MongoDB user ID for cross-reference
     */
    function createVault(string calldata userId) external {
        if (_vaults[msg.sender].exists) revert VaultAlreadyExists();

        _vaults[msg.sender] = Vault({
            owner       : msg.sender,
            userId      : userId,
            storageUsed : 0,
            storageQuota: DEFAULT_QUOTA,
            fileCount   : 0,
            createdAt   : block.timestamp,
            exists      : true
        });

        emit VaultCreated(msg.sender, userId, DEFAULT_QUOTA);
    }

    /**
     * @notice Update storage stats (called by backend after IPFS upload)
     * @param owner     Vault owner address
     * @param fileSizeBytes Size of file uploaded
     */
    function addStorage(address owner, uint256 fileSizeBytes) external {
        if (!_vaults[owner].exists) revert VaultNotFound();

        Vault storage v = _vaults[owner];
        if (v.storageUsed + fileSizeBytes > v.storageQuota) {
            revert StorageQuotaExceeded(v.storageUsed + fileSizeBytes, v.storageQuota);
        }

        v.storageUsed += fileSizeBytes;
        v.fileCount++;

        emit StorageUpdated(owner, v.storageUsed, v.storageQuota);
    }

    /**
     * @notice Remove storage when file is deleted
     */
    function removeStorage(address owner, uint256 fileSizeBytes) external {
        if (!_vaults[owner].exists) revert VaultNotFound();
        Vault storage v = _vaults[owner];
        v.storageUsed   = v.storageUsed > fileSizeBytes ? v.storageUsed - fileSizeBytes : 0;
        if (v.fileCount > 0) v.fileCount--;
        emit StorageUpdated(owner, v.storageUsed, v.storageQuota);
    }

    /**
     * @notice Grant access to a file to another address
     */
    function grantAccess(address grantee, uint256 tokenId, uint256 expiresAt) external {
        if (!_vaults[msg.sender].exists) revert VaultNotFound();

        _grants[msg.sender].push(AccessGrant({
            grantee  : grantee,
            tokenId  : tokenId,
            expiresAt: expiresAt,
            active   : true
        }));

        _accessMap[grantee][msg.sender] = true;
        emit AccessGranted(msg.sender, grantee, tokenId);
    }

    /* ══════════════════════════════════════════
       READ FUNCTIONS
    ══════════════════════════════════════════ */

    function getVault(address owner)
        external
        view
        returns (
            uint256 storageUsed,
            uint256 storageQuota,
            uint256 fileCount,
            uint256 createdAt,
            string  memory userId
        )
    {
        if (!_vaults[owner].exists) revert VaultNotFound();
        Vault storage v = _vaults[owner];
        return (v.storageUsed, v.storageQuota, v.fileCount, v.createdAt, v.userId);
    }

    function hasVault(address owner) external view returns (bool) {
        return _vaults[owner].exists;
    }

    function storageRemaining(address owner) external view returns (uint256) {
        if (!_vaults[owner].exists) return 0;
        Vault storage v = _vaults[owner];
        return v.storageQuota - v.storageUsed;
    }
}
