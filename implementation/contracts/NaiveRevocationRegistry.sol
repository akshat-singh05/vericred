// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ICredentialAnchor.sol";
import "./lib/CredentialId.sol";

/// @notice Baseline revocation scheme used ONLY for Experiment 2's gas
/// comparison against RevocationRegistry's bitmap: one storage slot per
/// credential instead of 256 credentials per slot.
contract NaiveRevocationRegistry {
    using CredentialId for uint256;

    ICredentialAnchor public immutable anchor;

    mapping(uint256 => bool) private revoked;

    event CredentialRevoked(uint256 indexed credentialId, address indexed issuer);

    constructor(address anchorAddr) {
        require(anchorAddr != address(0), "NaiveRevocationRegistry: zero address");
        anchor = ICredentialAnchor(anchorAddr);
    }

    function revoke(uint256 credentialId) external {
        address issuer = _issuerOf(credentialId);
        require(msg.sender == issuer, "NaiveRevocationRegistry: caller is not the issuing institution");
        revoked[credentialId] = true;
        emit CredentialRevoked(credentialId, issuer);
    }

    function isRevoked(uint256 credentialId) external view returns (bool) {
        return revoked[credentialId];
    }

    function _issuerOf(uint256 credentialId) private view returns (address) {
        if (credentialId.isSingle()) {
            uint256 singleId = credentialId.decodeSingleCredential();
            return anchor.singleIssuerOf(singleId);
        } else {
            (uint256 batchId, ) = credentialId.decodeBatchCredential();
            return anchor.batchIssuerOf(batchId);
        }
    }
}
