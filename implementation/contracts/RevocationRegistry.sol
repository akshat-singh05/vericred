// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ICredentialAnchor.sol";
import "./lib/CredentialId.sol";

/// @notice Gas-efficient revocation: 256 credential-status bits packed into
/// one storage slot (contribution C2). Compare against NaiveRevocationRegistry
/// for Experiment 2's head-to-head gas measurement.
contract RevocationRegistry {
    using CredentialId for uint256;

    ICredentialAnchor public immutable anchor;

    // credentialId's high 250 bits (i.e. credentialId / 256) => 256-bit slot
    mapping(uint256 => uint256) private statusBitmap;

    event CredentialRevoked(uint256 indexed credentialId, address indexed issuer);

    constructor(address anchorAddr) {
        require(anchorAddr != address(0), "RevocationRegistry: zero address");
        anchor = ICredentialAnchor(anchorAddr);
    }

    function revoke(uint256 credentialId) external {
        address issuer = _issuerOf(credentialId);
        require(msg.sender == issuer, "RevocationRegistry: caller is not the issuing institution");
        uint256 slot = credentialId >> 8;
        uint256 bit = credentialId & 0xff;
        statusBitmap[slot] |= (1 << bit);
        emit CredentialRevoked(credentialId, issuer);
    }

    function isRevoked(uint256 credentialId) external view returns (bool) {
        uint256 slot = credentialId >> 8;
        uint256 bit = credentialId & 0xff;
        return (statusBitmap[slot] & (1 << bit)) != 0;
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
