const { ethers } = require("hardhat");

/**
 * Deploys the full contract suite and wires governance <-> registry.
 * @param {string[]} initialMemberAddrs
 * @param {number} threshold
 */
async function deploySuite(initialMemberAddrs, threshold) {
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();

  const ConsortiumGovernance = await ethers.getContractFactory("ConsortiumGovernance");
  const governance = await ConsortiumGovernance.deploy(
    await issuerRegistry.getAddress(),
    initialMemberAddrs,
    threshold
  );
  await governance.waitForDeployment();

  await (await issuerRegistry.setGovernance(await governance.getAddress())).wait();

  const CredentialAnchor = await ethers.getContractFactory("CredentialAnchor");
  const anchor = await CredentialAnchor.deploy(await issuerRegistry.getAddress());
  await anchor.waitForDeployment();

  const RevocationRegistry = await ethers.getContractFactory("RevocationRegistry");
  const revocation = await RevocationRegistry.deploy(await anchor.getAddress());
  await revocation.waitForDeployment();

  const NaiveRevocationRegistry = await ethers.getContractFactory("NaiveRevocationRegistry");
  const naiveRevocation = await NaiveRevocationRegistry.deploy(await anchor.getAddress());
  await naiveRevocation.waitForDeployment();

  return { issuerRegistry, governance, anchor, revocation, naiveRevocation };
}

/** Proposes + votes an AddInstitution proposal to quorum, registering `institution` as issuer+member. */
async function onboardInstitution(governance, voters, institution, did, signingKey) {
  const tx = await governance
    .connect(voters[0])
    .proposeAddInstitution(institution.address ?? institution, did, signingKey.address ?? signingKey);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((l) => {
      try {
        return governance.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "ProposalCreated");
  const proposalId = event.args.proposalId;
  for (let i = 1; i < voters.length; i++) {
    const p = await governance.getProposal(proposalId);
    if (p.executed) break;
    await governance.connect(voters[i]).vote(proposalId);
  }
  return proposalId;
}

module.exports = { deploySuite, onboardInstitution };
