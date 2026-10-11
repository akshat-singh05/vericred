// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIssuerRegistry.sol";

/// @notice Tracks each member institution's DID and full signing-key
/// rotation history. All mutations (registration, deactivation, key
/// rotation) are restricted to the ConsortiumGovernance contract so that key
/// rotation is itself a governed, M-of-N action rather than
/// something a single compromised key can do unilaterally.
contract IssuerRegistry is IIssuerRegistry {
    struct KeyRecord {
        address signingKey;
        uint256 validFrom;
        uint256 validUntil; // 0 means still currently valid
    }

    struct Issuer {
        string did;
        bool active;
        bool exists;
        KeyRecord[] keyHistory;
    }

    address public governance;
    mapping(address => Issuer) private issuers;
    address[] public institutionList;

    event GovernanceSet(address indexed governance);
    event IssuerRegistered(address indexed institution, string did, address initialSigningKey);
    event IssuerDeactivated(address indexed institution);
    event IssuerReactivated(address indexed institution);
    event KeyRotated(address indexed institution, address indexed oldKey, address indexed newKey, uint256 timestamp);

    modifier onlyGovernance() {
        require(msg.sender == governance, "IssuerRegistry: caller is not governance");
        _;
    }

    /// @dev Governance address is set once, immediately after both contracts
    /// are deployed (see deployment script) — a two-step wiring because
    /// ConsortiumGovernance's constructor also needs this registry's address.
    function setGovernance(address governanceAddr) external {
        require(governance == address(0), "IssuerRegistry: governance already set");
        require(governanceAddr != address(0), "IssuerRegistry: zero address");
        governance = governanceAddr;
        emit GovernanceSet(governanceAddr);
    }

    function registerIssuer(address institution, string calldata did, address initialSigningKey) external onlyGovernance {
        require(institution != address(0) && initialSigningKey != address(0), "IssuerRegistry: zero address");
        Issuer storage issuer = issuers[institution];
        require(!issuer.exists, "IssuerRegistry: already registered");
        issuer.did = did;
        issuer.active = true;
        issuer.exists = true;
        issuer.keyHistory.push(KeyRecord({signingKey: initialSigningKey, validFrom: block.timestamp, validUntil: 0}));
        institutionList.push(institution);
        emit IssuerRegistered(institution, did, initialSigningKey);
    }

    function deactivateIssuer(address institution) external onlyGovernance {
        Issuer storage issuer = issuers[institution];
        require(issuer.exists, "IssuerRegistry: unknown institution");
        require(issuer.active, "IssuerRegistry: already inactive");
        issuer.active = false;
        emit IssuerDeactivated(institution);
    }

    function reactivateIssuer(address institution) external onlyGovernance {
        Issuer storage issuer = issuers[institution];
        require(issuer.exists, "IssuerRegistry: unknown institution");
        require(!issuer.active, "IssuerRegistry: already active");
        issuer.active = true;
        emit IssuerReactivated(institution);
    }

    /// @dev Closes out the current key's validity window and opens a new
    /// one. Signatures made under the old key remain verifiable for
    /// credentials whose batch timestamp falls before this rotation.
    function rotateKey(address institution, address newSigningKey) external onlyGovernance {
        require(newSigningKey != address(0), "IssuerRegistry: zero address");
        Issuer storage issuer = issuers[institution];
        require(issuer.exists, "IssuerRegistry: unknown institution");
        uint256 len = issuer.keyHistory.length;
        address oldKey = issuer.keyHistory[len - 1].signingKey;
        issuer.keyHistory[len - 1].validUntil = block.timestamp;
        issuer.keyHistory.push(KeyRecord({signingKey: newSigningKey, validFrom: block.timestamp, validUntil: 0}));
        emit KeyRotated(institution, oldKey, newSigningKey, block.timestamp);
    }

    function isActiveIssuer(address institution) external view override returns (bool) {
        return issuers[institution].exists && issuers[institution].active;
    }

    function currentSigningKey(address institution) external view override returns (address) {
        Issuer storage issuer = issuers[institution];
        require(issuer.exists, "IssuerRegistry: unknown institution");
        return issuer.keyHistory[issuer.keyHistory.length - 1].signingKey;
    }

    function signingKeyAt(address institution, uint256 timestamp) external view override returns (address) {
        Issuer storage issuer = issuers[institution];
        require(issuer.exists, "IssuerRegistry: unknown institution");
        KeyRecord[] storage history = issuer.keyHistory;
        for (uint256 i = 0; i < history.length; i++) {
            KeyRecord storage rec = history[i];
            if (timestamp >= rec.validFrom && (rec.validUntil == 0 || timestamp < rec.validUntil)) {
                return rec.signingKey;
            }
        }
        revert("IssuerRegistry: no key valid at given timestamp");
    }

    function getDid(address institution) external view returns (string memory) {
        require(issuers[institution].exists, "IssuerRegistry: unknown institution");
        return issuers[institution].did;
    }

    function keyHistoryLength(address institution) external view returns (uint256) {
        return issuers[institution].keyHistory.length;
    }

    function keyHistoryAt(address institution, uint256 index) external view returns (address signingKey, uint256 validFrom, uint256 validUntil) {
        KeyRecord storage rec = issuers[institution].keyHistory[index];
        return (rec.signingKey, rec.validFrom, rec.validUntil);
    }

    function institutionCount() external view returns (uint256) {
        return institutionList.length;
    }
}
