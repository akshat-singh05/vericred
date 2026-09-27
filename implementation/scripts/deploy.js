const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

/**
 * Deploys the full VeriCred contract suite and seeds a demo consortium
 * (accreditation body + 2 founding universities, 2-of-3 threshold) so the
 * backend/frontend have something to talk to immediately. Writes addresses
 * to backend/deployment.json (gitignored — regenerate with `npm run deploy`).
 */
async function main() {
  const signers = await ethers.getSigners();
  const [deployer, accreditationBody, universityA, universityB, employerDemo] = signers;

  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();

  const initialMembers = [accreditationBody.address, universityA.address, universityB.address];
  const threshold = 2;
  const ConsortiumGovernance = await ethers.getContractFactory("ConsortiumGovernance");
  const governance = await ConsortiumGovernance.deploy(await issuerRegistry.getAddress(), initialMembers, threshold);
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

  // Register universityA and universityB as issuers via governance vote (2-of-3),
  // each with its own randomly generated off-chain signing key (decoupled from
  // the on-chain account, per the identity model documented in offchain/verifier.js).
  const universityASigningKey = ethers.Wallet.createRandom();
  const universityBSigningKey = ethers.Wallet.createRandom();

  await proposeAndVote(governance, [accreditationBody, universityA], "proposeAddInstitution", [
    universityA.address,
    "did:vericred:university-a",
    universityASigningKey.address,
  ]);
  await proposeAndVote(governance, [accreditationBody, universityA], "proposeAddInstitution", [
    universityB.address,
    "did:vericred:university-b",
    universityBSigningKey.address,
  ]);

  const deployment = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    contracts: {
      IssuerRegistry: await issuerRegistry.getAddress(),
      ConsortiumGovernance: await governance.getAddress(),
      CredentialAnchor: await anchor.getAddress(),
      RevocationRegistry: await revocation.getAddress(),
      NaiveRevocationRegistry: await naiveRevocation.getAddress(),
    },
    demoAccounts: {
      deployer: deployer.address,
      accreditationBody: accreditationBody.address,
      universityA: { institutionAddress: universityA.address, signingKey: universityASigningKey.address, signingKeyPrivate: universityASigningKey.privateKey, did: "did:vericred:university-a" },
      universityB: { institutionAddress: universityB.address, signingKey: universityBSigningKey.address, signingKeyPrivate: universityBSigningKey.privateKey, did: "did:vericred:university-b" },
      employerDemo: employerDemo.address,
    },
    governanceThreshold: threshold,
    governanceMembers: initialMembers,
  };

  const outPath = path.join(__dirname, "..", "backend", "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`Deployed to ${network.name}. Wrote ${outPath}`);
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

async function proposeAndVote(governance, voters, methodName, args) {
  const tx = await governance.connect(voters[0])[methodName](...args);
  const receipt = await tx.wait();
  const created = receipt.logs
    .map((l) => {
      try {
        return governance.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "ProposalCreated");
  const proposalId = created.args.proposalId;
  for (let i = 1; i < voters.length; i++) {
    const p = await governance.getProposal(proposalId);
    if (p.executed) break;
    await governance.connect(voters[i]).vote(proposalId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
