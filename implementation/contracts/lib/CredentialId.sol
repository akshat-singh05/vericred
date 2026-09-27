// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Encodes/decodes the global credential identifiers used across
/// CredentialAnchor and the revocation registries, without requiring any
/// per-credential on-chain registration step (which would defeat the O(1)
/// per-batch cost goal). A credential ID is derived purely off-chain from a
/// batch ID + leaf index (or a single-issuance counter), and the registries
/// resolve "who issued this" by looking the batch/single record up on
/// CredentialAnchor at revoke() time.
library CredentialId {
    // Bit 255 distinguishes single-issuance IDs (1) from batch-derived IDs (0).
    uint256 private constant SINGLE_FLAG = 1 << 255;
    // Batch-derived layout: [ unused | batchId (160 bits) | leafIndex (32 bits) ]
    uint256 private constant LEAF_INDEX_BITS = 32;

    function encodeBatchCredential(uint256 batchId, uint32 leafIndex) internal pure returns (uint256) {
        require(batchId < (1 << 160), "CredentialId: batchId overflow");
        return (batchId << LEAF_INDEX_BITS) | uint256(leafIndex);
    }

    function decodeBatchCredential(uint256 credentialId) internal pure returns (uint256 batchId, uint32 leafIndex) {
        require(credentialId & SINGLE_FLAG == 0, "CredentialId: not a batch credential");
        batchId = credentialId >> LEAF_INDEX_BITS;
        leafIndex = uint32(credentialId & ((1 << LEAF_INDEX_BITS) - 1));
    }

    function encodeSingleCredential(uint256 singleId) internal pure returns (uint256) {
        require(singleId < SINGLE_FLAG, "CredentialId: singleId overflow");
        return SINGLE_FLAG | singleId;
    }

    function decodeSingleCredential(uint256 credentialId) internal pure returns (uint256 singleId) {
        require(credentialId & SINGLE_FLAG != 0, "CredentialId: not a single credential");
        singleId = credentialId & ~SINGLE_FLAG;
    }

    function isSingle(uint256 credentialId) internal pure returns (bool) {
        return credentialId & SINGLE_FLAG != 0;
    }
}
