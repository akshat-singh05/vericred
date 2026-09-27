const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("./helpers/deploy");
const { buildBatch } = require("../offchain/issuance");
const { buildSelectiveDisclosure } = require("../offchain/disclosure");
const { verifyPresentation } = require("../offchain/verifier");
const { CredentialId } = require("../offchain/credentialId");

describe("End-to-end: batch issuance -> selective disclosure -> verification", function () {
  let issuerRegistry, credentialAnchor, revocationRegistry, governance;
  let m1, m2, institution;
  let signingWallet; // off-chain issuer signing key, independent of the on-chain institution account
  let batchBuild, batchId, contracts;

  const cohort = [
    { subjectId: "did:example:student1", fields: { name: "Asha Rao", degree: "B.Tech", major: "CSE", graduationYear: "2025", gpa: "9.1" } },
    { subjectId: "did:example:student2", fields: { name: "Ben Iyer", degree: "B.Tech", major: "ECE", graduationYear: "2025", gpa: "8.4" } },
    { subjectId: "did:example:student3", fields: { name: "Chitra Nair", degree: "M.Tech", major: "CSE", graduationYear: "2025", gpa: "9.6" } },
  ];

  beforeEach(async function () {
    [, m1, m2, institution] = await ethers.getSigners();
    ({ issuerRegistry, governance, anchor: credentialAnchor, revocation: revocationRegistry } = await deploySuite(
      [m1.address, m2.address],
      2
    ));
    signingWallet = ethers.Wallet.createRandom();
    await onboardInstitution(governance, [m1, m2], institution, "did:vericred:vit", signingWallet);

    batchBuild = await buildBatch(cohort, signingWallet, "did:vericred:vit", "2025-06-15T00:00:00Z");
    const tx = await credentialAnchor.connect(institution).anchorBatch(batchBuild.batchRoot, cohort.length, "ipfs://cohort-2025-batch");
    const receipt = await tx.wait();
    const evt = receipt.logs.map((l) => {
      try { return credentialAnchor.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "BatchAnchored");
    batchId = Number(evt.args.batchId);

    contracts = { issuerRegistry, credentialAnchor, revocationRegistry };
  });

  it("verifies a fully-disclosed presentation as valid, with all 4 checks passing", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name", "degree", "major", "graduationYear", "gpa"], batchId);
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(true);
    expect(result.checks.map((c) => c.name)).to.deep.equal([
      "issuer_membership",
      "signature",
      "merkle_proof",
      "revocation_status",
    ]);
    expect(result.checks.every((c) => c.passed)).to.equal(true);
  });

  it("verifies a selective disclosure (GPA withheld) as valid without revealing gpa", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name", "degree", "major", "graduationYear"], batchId);
    expect(presentation.disclosedFields.gpa).to.equal(undefined);
    expect(presentation.undisclosedFieldHashes.gpa).to.be.a("string");
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(true);
  });

  it("verifies each student in the batch independently (proof indexed correctly per student)", async function () {
    for (let i = 0; i < cohort.length; i++) {
      const presentation = buildSelectiveDisclosure(batchBuild, i, ["name", "degree"], batchId);
      const result = await verifyPresentation(presentation, contracts);
      expect(result.valid, `student ${i} should verify`).to.equal(true);
    }
  });

  it("fails verification when a disclosed field value is tampered with", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name", "degree", "major", "graduationYear", "gpa"], batchId);
    presentation.disclosedFields.gpa.value = "10.0"; // forged grade
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    const merkleCheck = result.checks.find((c) => c.name === "merkle_proof");
    expect(merkleCheck.passed).to.equal(false);
  });

  it("fails verification when the disclosed salt is tampered with", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name", "degree"], batchId);
    presentation.disclosedFields.name.salt = "0x" + "11".repeat(32);
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    expect(result.checks.find((c) => c.name === "merkle_proof").passed).to.equal(false);
  });

  it("fails verification with a forged Merkle proof (wrong sibling)", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name", "degree"], batchId);
    presentation.batchLeafProof = presentation.batchLeafProof.map((step) => ({
      ...step,
      sibling: ethers.keccak256(ethers.toUtf8Bytes("forged-sibling")),
    }));
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    expect(result.checks.find((c) => c.name === "merkle_proof").passed).to.equal(false);
  });

  it("fails verification when the batch signature does not match the issuer's key", async function () {
    const wrongWallet = ethers.Wallet.createRandom();
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name"], batchId);
    presentation.batchSignature = await wrongWallet.signMessage(ethers.getBytes(batchBuild.batchRoot));
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    expect(result.checks.find((c) => c.name === "signature").passed).to.equal(false);
  });

  it("fails verification after the issuer is removed by governance (unauthorized/removed issuer)", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name"], batchId);
    const tx = await governance.connect(m1).proposeRemoveInstitution(institution.address);
    const receipt = await tx.wait();
    const created = receipt.logs.map((l) => {
      try { return governance.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "ProposalCreated");
    await governance.connect(m2).vote(created.args.proposalId);

    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    expect(result.checks.find((c) => c.name === "issuer_membership").passed).to.equal(false);
  });

  it("fails verification for a revoked credential", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 1, ["name", "degree"], batchId);
    await revocationRegistry.connect(institution).revoke(presentation.credentialId);
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    expect(result.checks.find((c) => c.name === "revocation_status").passed).to.equal(false);
  });

  it("revoking one student's credential does not affect other students in the same batch", async function () {
    const revokedPresentation = buildSelectiveDisclosure(batchBuild, 1, ["name"], batchId);
    await revocationRegistry.connect(institution).revoke(revokedPresentation.credentialId);

    const otherPresentation = buildSelectiveDisclosure(batchBuild, 0, ["name"], batchId);
    const result = await verifyPresentation(otherPresentation, contracts);
    expect(result.valid).to.equal(true);
  });

  it("rejects a credential id crafted for a different (nonexistent) batch", async function () {
    const presentation = buildSelectiveDisclosure(batchBuild, 0, ["name"], batchId);
    presentation.batchId = 9999;
    presentation.credentialId = CredentialId.encodeBatchCredential(9999, 0).toString();
    const result = await verifyPresentation(presentation, contracts);
    expect(result.valid).to.equal(false);
    expect(result.checks[0].passed).to.equal(false);
  });
});
