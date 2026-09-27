// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICredentialAnchor {
    function batchIssuerOf(uint256 batchId) external view returns (address);
    function singleIssuerOf(uint256 singleId) external view returns (address);
    function getBatchRoot(uint256 batchId) external view returns (bytes32);
}
