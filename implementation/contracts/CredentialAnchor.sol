// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIssuerRegistry.sol";
import "./interfaces/ICredentialAnchor.sol";

/// @notice Anchors either (a) a whole cohort's Merkle batch root in one
/// transaction ("O(1) per batch"), or (b) a single
/// credential hash, kept only as the naive per-credential baseline used for
/// the issuance-cost gas comparison (experiments/).
contract CredentialAnchor is ICredentialAnchor {
    struct Batch {
        address issuer;
        bytes32 merkleRoot;
        uint256 timestamp;
        uint256 credentialCount;
        string metadataURI; // e.g. ipfs://<CID> pointing to encrypted batch manifest
    }

    struct SingleCredential {
        address issuer;
        bytes32 credentialHash;
        uint256 timestamp;
        string metadataURI;
    }

    IIssuerRegistry public immutable issuerRegistry;

    uint256 public batchCount;
    mapping(uint256 => Batch) public batches;

    uint256 public singleCount;
    mapping(uint256 => SingleCredential) public singleCredentials;

    event BatchAnchored(uint256 indexed batchId, address indexed issuer, bytes32 merkleRoot, uint256 credentialCount, string metadataURI);
    event SingleCredentialIssued(uint256 indexed singleId, address indexed issuer, bytes32 credentialHash, string metadataURI);

    modifier onlyActiveIssuer() {
        require(issuerRegistry.isActiveIssuer(msg.sender), "CredentialAnchor: caller is not an active issuer");
        _;
    }

    constructor(address issuerRegistryAddr) {
        require(issuerRegistryAddr != address(0), "CredentialAnchor: zero address");
        issuerRegistry = IIssuerRegistry(issuerRegistryAddr);
    }

    /// @dev credentialCount is trusted issuer-supplied metadata (used for
    /// reporting/UI only); on-chain cost does not depend on its value, which
    /// is exactly the O(1)-per-batch property Experiment 1 measures.
    function anchorBatch(bytes32 merkleRoot, uint256 credentialCount, string calldata metadataURI) external onlyActiveIssuer returns (uint256 batchId) {
        require(merkleRoot != bytes32(0), "CredentialAnchor: empty root");
        require(credentialCount > 0, "CredentialAnchor: empty batch");
        batchId = batchCount++;
        batches[batchId] = Batch({
            issuer: msg.sender,
            merkleRoot: merkleRoot,
            timestamp: block.timestamp,
            credentialCount: credentialCount,
            metadataURI: metadataURI
        });
        emit BatchAnchored(batchId, msg.sender, merkleRoot, credentialCount, metadataURI);
    }

    function issueSingle(bytes32 credentialHash, string calldata metadataURI) external onlyActiveIssuer returns (uint256 singleId) {
        require(credentialHash != bytes32(0), "CredentialAnchor: empty hash");
        singleId = singleCount++;
        singleCredentials[singleId] = SingleCredential({
            issuer: msg.sender,
            credentialHash: credentialHash,
            timestamp: block.timestamp,
            metadataURI: metadataURI
        });
        emit SingleCredentialIssued(singleId, msg.sender, credentialHash, metadataURI);
    }

    function getBatchRoot(uint256 batchId) external view override returns (bytes32) {
        require(batchId < batchCount, "CredentialAnchor: unknown batch");
        return batches[batchId].merkleRoot;
    }

    function getBatchTimestamp(uint256 batchId) external view returns (uint256) {
        require(batchId < batchCount, "CredentialAnchor: unknown batch");
        return batches[batchId].timestamp;
    }

    function batchIssuerOf(uint256 batchId) external view override returns (address) {
        require(batchId < batchCount, "CredentialAnchor: unknown batch");
        return batches[batchId].issuer;
    }

    function singleIssuerOf(uint256 singleId) external view override returns (address) {
        require(singleId < singleCount, "CredentialAnchor: unknown single credential");
        return singleCredentials[singleId].issuer;
    }
}
