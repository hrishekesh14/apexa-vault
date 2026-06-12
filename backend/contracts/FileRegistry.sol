// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FileRegistry
 * @author Hrishekesh Varma
 * @notice APEXA VAULT — On-chain file ownership registry
 *
 * Stores immutable records of:
 *   - File integrity hash (SHA-256)
 *   - IPFS CID
 *   - Owner wallet address
 *   - Upload timestamp
 *
 * Each file gets a unique tokenId for reference.
 * Records are immutable — once registered, cannot be altered.
 */
contract FileRegistry {

    /* ══════════════════════════════════════════
       STRUCTS
    ══════════════════════════════════════════ */
    struct FileRecord {
        bytes32  fileHash;      // SHA-256 hash of the file (bytes32)
        string   cid;           // IPFS CID v1 (bafybei...)
        address  owner;         // Wallet address of file owner
        uint256  timestamp;     // Unix timestamp of registration
        bool     exists;        // Guard for existence checks
    }

    /* ══════════════════════════════════════════
       STATE
    ══════════════════════════════════════════ */
    // tokenId => FileRecord
    mapping(uint256 => FileRecord) private _records;

    // fileHash => tokenId (for quick lookup)
    mapping(bytes32 => uint256) private _hashToToken;

    // owner address => list of tokenIds
    mapping(address => uint256[]) private _ownerFiles;

    // Total files registered
    uint256 private _totalFiles;

    // Contract owner (deployer) for admin functions
    address public immutable contractOwner;

    /* ══════════════════════════════════════════
       EVENTS
    ══════════════════════════════════════════ */
    event FileRegistered(
        uint256 indexed tokenId,
        bytes32 indexed fileHash,
        address indexed owner,
        string  cid,
        uint256 timestamp
    );

    event FileTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );

    /* ══════════════════════════════════════════
       ERRORS
    ══════════════════════════════════════════ */
    error FileAlreadyRegistered(bytes32 fileHash, uint256 existingTokenId);
    error FileNotFound(uint256 tokenId);
    error Unauthorized();
    error InvalidHash();
    error InvalidCID();

    /* ══════════════════════════════════════════
       CONSTRUCTOR
    ══════════════════════════════════════════ */
    constructor() {
        contractOwner = msg.sender;
        _totalFiles   = 0;
    }

    /* ══════════════════════════════════════════
       MODIFIERS
    ══════════════════════════════════════════ */
    modifier onlyOwner() {
        if (msg.sender != contractOwner) revert Unauthorized();
        _;
    }

    modifier recordExists(uint256 tokenId) {
        if (!_records[tokenId].exists) revert FileNotFound(tokenId);
        _;
    }

    /* ══════════════════════════════════════════
       WRITE FUNCTIONS
    ══════════════════════════════════════════ */

    /**
     * @notice Register a file on-chain
     * @param fileHash  SHA-256 hash of the file as bytes32
     * @param cid       IPFS CID string (e.g. bafybei...)
     * @param owner     Wallet address of the file owner
     * @return tokenId  Unique ID for this file record
     *
     * Called by backend BlockchainService.registerFile()
     */
    function registerFile(
        bytes32 fileHash,
        string calldata cid,
        address owner
    ) external returns (uint256) {
        // Validate inputs
        if (fileHash == bytes32(0))    revert InvalidHash();
        if (bytes(cid).length == 0)   revert InvalidCID();
        if (owner == address(0))       owner = msg.sender;

        // Prevent duplicate hash registration
        if (_hashToToken[fileHash] != 0) {
            revert FileAlreadyRegistered(fileHash, _hashToToken[fileHash]);
        }

        // Mint record
        _totalFiles++;
        uint256 tokenId = _totalFiles;

        _records[tokenId] = FileRecord({
            fileHash : fileHash,
            cid      : cid,
            owner    : owner,
            timestamp: block.timestamp,
            exists   : true
        });

        _hashToToken[fileHash] = tokenId;
        _ownerFiles[owner].push(tokenId);

        emit FileRegistered(tokenId, fileHash, owner, cid, block.timestamp);

        return tokenId;
    }

    /**
     * @notice Transfer file ownership to another address
     * @param tokenId  The file token ID
     * @param newOwner The new owner's address
     */
    function transferOwnership(uint256 tokenId, address newOwner)
        external
        recordExists(tokenId)
    {
        FileRecord storage rec = _records[tokenId];
        if (msg.sender != rec.owner && msg.sender != contractOwner) {
            revert Unauthorized();
        }
        address oldOwner = rec.owner;
        rec.owner = newOwner;
        _ownerFiles[newOwner].push(tokenId);
        emit FileTransferred(tokenId, oldOwner, newOwner);
    }

    /* ══════════════════════════════════════════
       READ FUNCTIONS
    ══════════════════════════════════════════ */

    /**
     * @notice Verify a file by its hash
     * @param fileHash  SHA-256 hash to look up
     * @return verified True if registered
     * @return owner    Owner address
     * @return timestamp Registration time
     * @return cid      IPFS CID
     */
    function verifyFile(bytes32 fileHash)
        external
        view
        returns (
            bool    verified,
            address owner,
            uint256 timestamp,
            string  memory cid
        )
    {
        uint256 tokenId = _hashToToken[fileHash];
        if (tokenId == 0) return (false, address(0), 0, "");

        FileRecord storage rec = _records[tokenId];
        return (true, rec.owner, rec.timestamp, rec.cid);
    }

    /**
     * @notice Get full record by tokenId
     */
    function getRecord(uint256 tokenId)
        external
        view
        recordExists(tokenId)
        returns (
            bytes32 fileHash,
            string  memory cid,
            address owner,
            uint256 timestamp
        )
    {
        FileRecord storage rec = _records[tokenId];
        return (rec.fileHash, rec.cid, rec.owner, rec.timestamp);
    }

    /**
     * @notice Get all tokenIds for a given owner
     */
    function getOwnerFiles(address owner)
        external
        view
        returns (uint256[] memory)
    {
        return _ownerFiles[owner];
    }

    /**
     * @notice Total files registered
     */
    function totalFiles() external view returns (uint256) {
        return _totalFiles;
    }

    /**
     * @notice Check if a hash has been registered
     */
    function isRegistered(bytes32 fileHash) external view returns (bool) {
        return _hashToToken[fileHash] != 0;
    }

    /**
     * @notice Get tokenId from hash
     */
    function getTokenId(bytes32 fileHash) external view returns (uint256) {
        return _hashToToken[fileHash];
    }
}
