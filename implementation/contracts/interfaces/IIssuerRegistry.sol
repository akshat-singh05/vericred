// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIssuerRegistry {
    function isActiveIssuer(address institution) external view returns (bool);
    function currentSigningKey(address institution) external view returns (address);
    function signingKeyAt(address institution, uint256 timestamp) external view returns (address);
}
