const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("IssuerRegistry", function () {
  let issuerRegistry, deployer, governance, institution, otherKey, stranger;

  beforeEach(async function () {
    [deployer, governance, institution, otherKey, stranger] = await ethers.getSigners();
    const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await IssuerRegistry.deploy();
    await issuerRegistry.waitForDeployment();
    // Use an EOA as "governance" so IssuerRegistry can be unit-tested in isolation.
    await issuerRegistry.setGovernance(governance.address);
  });

  it("cannot set governance a second time", async function () {
    await expect(issuerRegistry.setGovernance(stranger.address)).to.be.revertedWith(
      "IssuerRegistry: governance already set"
    );
  });

  it("rejects non-governance callers on all admin functions", async function () {
    await expect(
      issuerRegistry.connect(stranger).registerIssuer(institution.address, "did:vericred:x", institution.address)
    ).to.be.revertedWith("IssuerRegistry: caller is not governance");
    await expect(issuerRegistry.connect(stranger).deactivateIssuer(institution.address)).to.be.revertedWith(
      "IssuerRegistry: caller is not governance"
    );
    await expect(
      issuerRegistry.connect(stranger).rotateKey(institution.address, otherKey.address)
    ).to.be.revertedWith("IssuerRegistry: caller is not governance");
  });

  it("registers an issuer with an initial key record", async function () {
    await expect(
      issuerRegistry.connect(governance).registerIssuer(institution.address, "did:vericred:vit", institution.address)
    )
      .to.emit(issuerRegistry, "IssuerRegistered")
      .withArgs(institution.address, "did:vericred:vit", institution.address);

    expect(await issuerRegistry.isActiveIssuer(institution.address)).to.equal(true);
    expect(await issuerRegistry.currentSigningKey(institution.address)).to.equal(institution.address);
    expect(await issuerRegistry.getDid(institution.address)).to.equal("did:vericred:vit");
    expect(await issuerRegistry.keyHistoryLength(institution.address)).to.equal(1);
  });

  it("rejects double registration of the same institution", async function () {
    await issuerRegistry.connect(governance).registerIssuer(institution.address, "did:vericred:vit", institution.address);
    await expect(
      issuerRegistry.connect(governance).registerIssuer(institution.address, "did:vericred:vit", institution.address)
    ).to.be.revertedWith("IssuerRegistry: already registered");
  });

  it("deactivates and reactivates an issuer", async function () {
    await issuerRegistry.connect(governance).registerIssuer(institution.address, "did:vericred:vit", institution.address);
    await expect(issuerRegistry.connect(governance).deactivateIssuer(institution.address))
      .to.emit(issuerRegistry, "IssuerDeactivated")
      .withArgs(institution.address);
    expect(await issuerRegistry.isActiveIssuer(institution.address)).to.equal(false);

    await expect(issuerRegistry.connect(governance).deactivateIssuer(institution.address)).to.be.revertedWith(
      "IssuerRegistry: already inactive"
    );

    await issuerRegistry.connect(governance).reactivateIssuer(institution.address);
    expect(await issuerRegistry.isActiveIssuer(institution.address)).to.equal(true);
  });

  it("rotates keys and preserves validity of the old key before the rotation timestamp", async function () {
    await issuerRegistry.connect(governance).registerIssuer(institution.address, "did:vericred:vit", institution.address);
    const beforeRotation = await time.latest();

    await time.increase(100);
    await expect(issuerRegistry.connect(governance).rotateKey(institution.address, otherKey.address))
      .to.emit(issuerRegistry, "KeyRotated")
      .withArgs(institution.address, institution.address, otherKey.address, anyValueTimestamp());

    expect(await issuerRegistry.currentSigningKey(institution.address)).to.equal(otherKey.address);
    expect(await issuerRegistry.keyHistoryLength(institution.address)).to.equal(2);

    // A credential "issued" (timestamped) before rotation must still resolve to the OLD key.
    expect(await issuerRegistry.signingKeyAt(institution.address, beforeRotation)).to.equal(institution.address);
    // A credential timestamped after rotation resolves to the NEW key.
    const afterRotation = await time.latest();
    expect(await issuerRegistry.signingKeyAt(institution.address, afterRotation)).to.equal(otherKey.address);
  });

  it("reverts signingKeyAt for a timestamp before the institution existed", async function () {
    await expect(issuerRegistry.signingKeyAt(institution.address, 1)).to.be.revertedWith(
      "IssuerRegistry: unknown institution"
    );
  });

  it("tracks institutionCount and exposes full key history via keyHistoryAt", async function () {
    expect(await issuerRegistry.institutionCount()).to.equal(0);
    await issuerRegistry.connect(governance).registerIssuer(institution.address, "did:vericred:vit", institution.address);
    expect(await issuerRegistry.institutionCount()).to.equal(1);

    await issuerRegistry.connect(governance).rotateKey(institution.address, otherKey.address);
    expect(await issuerRegistry.keyHistoryLength(institution.address)).to.equal(2);

    const rec0 = await issuerRegistry.keyHistoryAt(institution.address, 0);
    expect(rec0.signingKey).to.equal(institution.address);
    expect(rec0.validUntil).to.not.equal(0n); // closed out by the rotation
    const rec1 = await issuerRegistry.keyHistoryAt(institution.address, 1);
    expect(rec1.signingKey).to.equal(otherKey.address);
    expect(rec1.validUntil).to.equal(0n); // still open
  });

  function anyValueTimestamp() {
    // chai-matchers doesn't ship anyValue by default in this toolbox version for withArgs blocks;
    // simplest robust check is to just not assert the exact timestamp value.
    return require("@nomicfoundation/hardhat-chai-matchers/withArgs").anyValue;
  }
});
