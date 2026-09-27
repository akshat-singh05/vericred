const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("./helpers/deploy");

// Note on identity model: `issuerA` is the institution's on-chain account —
// the same address used both as a ConsortiumGovernance member and as the
// caller of CredentialAnchor functions (gated via IssuerRegistry.isActiveIssuer,
// which is keyed by institution address and does NOT depend on the current
// off-chain signing key). `issuerAKey` is a *separate* off-chain VC-signing
// key registered for issuerA — on-chain calling rights and the off-chain
// signing key are intentionally decoupled so key rotation (see
// IssuerRegistry.test.js) never affects on-chain permissions.
describe("CredentialAnchor", function () {
  let anchor, governance, m1, m2, issuerA, issuerAKey, stranger;
  const root = ethers.keccak256(ethers.toUtf8Bytes("cohort-2025-root"));
  const credHash = ethers.keccak256(ethers.toUtf8Bytes("single-credential"));

  beforeEach(async function () {
    [, m1, m2, issuerA, issuerAKey, stranger] = await ethers.getSigners();
    ({ governance, anchor } = await deploySuite([m1.address, m2.address], 2));
    await onboardInstitution(governance, [m1, m2], issuerA, "did:vericred:issuerA", issuerAKey);
  });

  it("rejects anchoring/issuing from a non-issuer", async function () {
    await expect(anchor.connect(stranger).anchorBatch(root, 100, "ipfs://batch")).to.be.revertedWith(
      "CredentialAnchor: caller is not an active issuer"
    );
    await expect(anchor.connect(stranger).issueSingle(credHash, "ipfs://cred")).to.be.revertedWith(
      "CredentialAnchor: caller is not an active issuer"
    );
  });

  it("rejects a call from the institution's signing key (not its on-chain account)", async function () {
    await expect(anchor.connect(issuerAKey).anchorBatch(root, 100, "ipfs://batch")).to.be.revertedWith(
      "CredentialAnchor: caller is not an active issuer"
    );
  });

  it("anchors a batch and records issuer/timestamp/root", async function () {
    await expect(anchor.connect(issuerA).anchorBatch(root, 250, "ipfs://batch1"))
      .to.emit(anchor, "BatchAnchored")
      .withArgs(0, issuerA.address, root, 250, "ipfs://batch1");

    expect(await anchor.batchCount()).to.equal(1);
    expect(await anchor.getBatchRoot(0)).to.equal(root);
    expect(await anchor.batchIssuerOf(0)).to.equal(issuerA.address);
    const b = await anchor.batches(0);
    expect(b.credentialCount).to.equal(250);
  });

  it("rejects an empty root or zero-size batch", async function () {
    await expect(anchor.connect(issuerA).anchorBatch(ethers.ZeroHash, 10, "u")).to.be.revertedWith(
      "CredentialAnchor: empty root"
    );
    await expect(anchor.connect(issuerA).anchorBatch(root, 0, "u")).to.be.revertedWith(
      "CredentialAnchor: empty batch"
    );
  });

  it("issues a single credential (naive baseline) and records issuer", async function () {
    await expect(anchor.connect(issuerA).issueSingle(credHash, "ipfs://cred1"))
      .to.emit(anchor, "SingleCredentialIssued")
      .withArgs(0, issuerA.address, credHash, "ipfs://cred1");
    expect(await anchor.singleCount()).to.equal(1);
    expect(await anchor.singleIssuerOf(0)).to.equal(issuerA.address);
  });

  it("reverts on lookups for unknown batch/single ids", async function () {
    await expect(anchor.getBatchRoot(0)).to.be.revertedWith("CredentialAnchor: unknown batch");
    await expect(anchor.batchIssuerOf(0)).to.be.revertedWith("CredentialAnchor: unknown batch");
    await expect(anchor.singleIssuerOf(0)).to.be.revertedWith("CredentialAnchor: unknown single credential");
  });

  it("stops accepting new anchors once the issuer is removed by governance", async function () {
    const tx = await governance.connect(m1).proposeRemoveInstitution(issuerA.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await governance.connect(m2).vote(created.args.proposalId);

    await expect(anchor.connect(issuerA).anchorBatch(root, 10, "u")).to.be.revertedWith(
      "CredentialAnchor: caller is not an active issuer"
    );
  });
});
