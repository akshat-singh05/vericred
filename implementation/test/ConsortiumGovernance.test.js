const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("./helpers/deploy");

describe("ConsortiumGovernance", function () {
  let issuerRegistry, governance, m1, m2, m3, nonMember, newUni, newUniKey;

  beforeEach(async function () {
    [, m1, m2, m3, nonMember, newUni, newUniKey] = await ethers.getSigners();
    ({ issuerRegistry, governance } = await deploySuite([m1.address, m2.address, m3.address], 2));
  });

  it("rejects construction with an invalid threshold", async function () {
    const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
    const reg = await IssuerRegistry.deploy();
    const ConsortiumGovernance = await ethers.getContractFactory("ConsortiumGovernance");
    await expect(
      ConsortiumGovernance.deploy(await reg.getAddress(), [m1.address], 2)
    ).to.be.revertedWith("Governance: invalid threshold");
    await expect(
      ConsortiumGovernance.deploy(await reg.getAddress(), [], 1)
    ).to.be.revertedWith("Governance: no initial members");
  });

  it("only members can propose or vote", async function () {
    await expect(
      governance.connect(nonMember).proposeAddInstitution(newUni.address, "did:vericred:new", newUniKey.address)
    ).to.be.revertedWith("Governance: caller is not a consortium member");
  });

  it("onboards a new institution once quorum (2-of-3) is reached", async function () {
    expect(await issuerRegistry.isActiveIssuer(newUni.address)).to.equal(false);

    const tx = await governance.connect(m1).proposeAddInstitution(newUni.address, "did:vericred:new", newUniKey.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    const proposalId = created.args.proposalId;

    // proposer's vote counted automatically -> 1/2, not yet executed
    let p = await governance.getProposal(proposalId);
    expect(p.votesFor).to.equal(1);
    expect(p.executed).to.equal(false);
    expect(await issuerRegistry.isActiveIssuer(newUni.address)).to.equal(false);

    // second vote reaches threshold -> auto-executes
    await expect(governance.connect(m2).vote(proposalId))
      .to.emit(governance, "ProposalExecuted");

    p = await governance.getProposal(proposalId);
    expect(p.executed).to.equal(true);
    expect(await governance.isMember(newUni.address)).to.equal(true);
    expect(await issuerRegistry.isActiveIssuer(newUni.address)).to.equal(true);
    expect(await issuerRegistry.currentSigningKey(newUni.address)).to.equal(newUniKey.address);
  });

  it("rejects voting twice on the same proposal", async function () {
    const tx = await governance.connect(m1).proposeAddInstitution(newUni.address, "did:vericred:new", newUniKey.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await expect(governance.connect(m1).vote(created.args.proposalId)).to.be.revertedWith(
      "Governance: already voted"
    );
  });

  it("rejects voting on an unknown proposal", async function () {
    await expect(governance.connect(m1).vote(999)).to.be.revertedWith("Governance: unknown proposal");
  });

  it("allows proposing issuer status for an address that is already a governance member but not yet an issuer", async function () {
    // m2 was seeded as a founding governance member in beforeEach but has no issuer registration yet —
    // this must be allowed so a consortium can bootstrap with governance-only founding members.
    await expect(governance.connect(m1).proposeAddInstitution(m2.address, "did:vericred:m2", m2.address)).to.not.be
      .reverted;
  });

  it("rejects proposing to add an institution that is already an active issuer", async function () {
    await onboardInstitution(governance, [m1, m2], newUni, "did:vericred:new", newUniKey);
    await expect(
      governance.connect(m1).proposeAddInstitution(newUni.address, "did:vericred:dup", newUniKey.address)
    ).to.be.revertedWith("Governance: institution already an active issuer");
  });

  it("registers issuer status for an already-existing member without duplicating membership", async function () {
    const beforeCount = await governance.memberCount();
    const tx = await governance.connect(m1).proposeAddInstitution(m2.address, "did:vericred:m2", m2.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await governance.connect(m3).vote(created.args.proposalId);

    expect(await governance.memberCount()).to.equal(beforeCount); // unchanged, no duplicate
    expect(await issuerRegistry.isActiveIssuer(m2.address)).to.equal(true);
  });

  it("removes an institution and deactivates its issuer status", async function () {
    await onboardInstitution(governance, [m1, m2], newUni, "did:vericred:new", newUniKey);
    expect(await issuerRegistry.isActiveIssuer(newUni.address)).to.equal(true);

    const tx = await governance.connect(m1).proposeRemoveInstitution(newUni.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await governance.connect(m2).vote(created.args.proposalId);

    expect(await governance.isMember(newUni.address)).to.equal(false);
    expect(await issuerRegistry.isActiveIssuer(newUni.address)).to.equal(false);
  });

  it("rotates an onboarded institution's signing key via governed vote", async function () {
    await onboardInstitution(governance, [m1, m2], newUni, "did:vericred:new", newUniKey);
    const [, , , , , , , replacementKey] = await ethers.getSigners();

    const tx = await governance.connect(m1).proposeRotateKey(newUni.address, replacementKey.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await governance.connect(m2).vote(created.args.proposalId);

    expect(await issuerRegistry.currentSigningKey(newUni.address)).to.equal(replacementKey.address);
  });

  it("rejects a non-member trying to vote on removal/rotation proposals", async function () {
    await onboardInstitution(governance, [m1, m2], newUni, "did:vericred:new", newUniKey);
    const tx = await governance.connect(m1).proposeRemoveInstitution(newUni.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await expect(governance.connect(nonMember).vote(created.args.proposalId)).to.be.revertedWith(
      "Governance: caller is not a consortium member"
    );
  });
});
