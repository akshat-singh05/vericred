// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIssuerRegistry.sol";

interface IIssuerRegistryAdmin is IIssuerRegistry {
    function registerIssuer(address institution, string calldata did, address initialSigningKey) external;
    function deactivateIssuer(address institution) external;
    function reactivateIssuer(address institution) external;
    function rotateKey(address institution, address newSigningKey) external;
}

/// @notice M-of-N consortium governance. Member universities/accreditation
/// bodies vote on admitting a new institution, removing one, or rotating an
/// institution's signing key. This is the mechanism that replaces the
/// single-issuer trust model of Blockcerts/EduCTX/UniverCert with M-of-N
/// consortium consent.
contract ConsortiumGovernance {
    enum ProposalType {
        AddInstitution,
        RemoveInstitution,
        RotateKey
    }

    struct Proposal {
        ProposalType proposalType;
        address institution;
        string did; // used for AddInstitution only
        address signingKey; // initial key (Add) or new key (RotateKey)
        uint256 votesFor;
        bool executed;
        uint256 createdAt;
        mapping(address => bool) hasVoted;
    }

    IIssuerRegistryAdmin public immutable issuerRegistry;
    uint256 public threshold; // M
    address[] public memberList;
    mapping(address => bool) public isMember;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) private proposals;

    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event ProposalCreated(uint256 indexed proposalId, ProposalType indexed proposalType, address indexed institution, address proposer);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 votesFor);
    event ProposalExecuted(uint256 indexed proposalId, ProposalType indexed proposalType, address indexed institution);

    modifier onlyMember() {
        require(isMember[msg.sender], "Governance: caller is not a consortium member");
        _;
    }

    constructor(address issuerRegistryAddr, address[] memory initialMembers, uint256 initialThreshold) {
        require(issuerRegistryAddr != address(0), "Governance: zero registry address");
        require(initialMembers.length > 0, "Governance: no initial members");
        require(initialThreshold > 0 && initialThreshold <= initialMembers.length, "Governance: invalid threshold");
        issuerRegistry = IIssuerRegistryAdmin(issuerRegistryAddr);
        threshold = initialThreshold;
        for (uint256 i = 0; i < initialMembers.length; i++) {
            address m = initialMembers[i];
            require(m != address(0), "Governance: zero member address");
            require(!isMember[m], "Governance: duplicate initial member");
            isMember[m] = true;
            memberList.push(m);
            emit MemberAdded(m);
        }
    }

    /// @dev Membership and issuer registration are related but distinct: a
    /// founding governance member (seeded in the constructor) may not yet be
    /// a registered issuer, so this only requires that the institution isn't
    /// *already an active issuer* — execution adds membership too, but only
    /// if the institution isn't a member yet (see _execute).
    function proposeAddInstitution(address institution, string calldata did, address initialSigningKey) external onlyMember returns (uint256) {
        require(institution != address(0) && initialSigningKey != address(0), "Governance: zero address");
        require(!issuerRegistry.isActiveIssuer(institution), "Governance: institution already an active issuer");
        return _createProposal(ProposalType.AddInstitution, institution, did, initialSigningKey);
    }

    function proposeRemoveInstitution(address institution) external onlyMember returns (uint256) {
        require(isMember[institution], "Governance: not a member");
        return _createProposal(ProposalType.RemoveInstitution, institution, "", address(0));
    }

    function proposeRotateKey(address institution, address newSigningKey) external onlyMember returns (uint256) {
        require(isMember[institution], "Governance: not a member");
        require(newSigningKey != address(0), "Governance: zero address");
        return _createProposal(ProposalType.RotateKey, institution, "", newSigningKey);
    }

    function _createProposal(ProposalType pType, address institution, string memory did, address signingKey) private returns (uint256) {
        uint256 proposalId = proposalCount++;
        Proposal storage p = proposals[proposalId];
        p.proposalType = pType;
        p.institution = institution;
        p.did = did;
        p.signingKey = signingKey;
        p.createdAt = block.timestamp;
        emit ProposalCreated(proposalId, pType, institution, msg.sender);
        _vote(proposalId, msg.sender);
        return proposalId;
    }

    function vote(uint256 proposalId) external onlyMember {
        _vote(proposalId, msg.sender);
    }

    function _vote(uint256 proposalId, address voter) private {
        Proposal storage p = proposals[proposalId];
        require(p.createdAt != 0, "Governance: unknown proposal");
        require(!p.executed, "Governance: already executed");
        require(!p.hasVoted[voter], "Governance: already voted");
        p.hasVoted[voter] = true;
        p.votesFor += 1;
        emit VoteCast(proposalId, voter, p.votesFor);
        if (p.votesFor >= threshold) {
            _execute(proposalId);
        }
    }

    function _execute(uint256 proposalId) private {
        Proposal storage p = proposals[proposalId];
        p.executed = true;
        if (p.proposalType == ProposalType.AddInstitution) {
            if (!isMember[p.institution]) {
                isMember[p.institution] = true;
                memberList.push(p.institution);
                emit MemberAdded(p.institution);
            }
            issuerRegistry.registerIssuer(p.institution, p.did, p.signingKey);
        } else if (p.proposalType == ProposalType.RemoveInstitution) {
            isMember[p.institution] = false;
            _removeFromMemberList(p.institution);
            emit MemberRemoved(p.institution);
            issuerRegistry.deactivateIssuer(p.institution);
        } else if (p.proposalType == ProposalType.RotateKey) {
            issuerRegistry.rotateKey(p.institution, p.signingKey);
        }
        emit ProposalExecuted(proposalId, p.proposalType, p.institution);
    }

    function _removeFromMemberList(address member) private {
        uint256 len = memberList.length;
        for (uint256 i = 0; i < len; i++) {
            if (memberList[i] == member) {
                memberList[i] = memberList[len - 1];
                memberList.pop();
                break;
            }
        }
    }

    function memberCount() external view returns (uint256) {
        return memberList.length;
    }

    function getProposal(uint256 proposalId) external view returns (
        ProposalType proposalType,
        address institution,
        string memory did,
        address signingKey,
        uint256 votesFor,
        bool executed,
        uint256 createdAt
    ) {
        Proposal storage p = proposals[proposalId];
        require(p.createdAt != 0, "Governance: unknown proposal");
        return (p.proposalType, p.institution, p.did, p.signingKey, p.votesFor, p.executed, p.createdAt);
    }

    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return proposals[proposalId].hasVoted[voter];
    }
}
