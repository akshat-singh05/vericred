const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("./helpers/deploy");

function encodeBatchCredential(batchId, leafIndex) {
  return (BigInt(batchId) << 32n) | BigInt(leafIndex);
}
function encodeSingleCredential(singleId) {
  return (1n << 255n) | BigInt(singleId);
}

describe("RevocationRegistry & NaiveRevocationRegistry", function () {
  let anchor, governance, revocation, naiveRevocation, m1, m2, issuerA, issuerB, issuerAKey, issuerBKey;
  const root = ethers.keccak256(ethers.toUtf8Bytes("cohort-root"));
  const credHash = ethers.keccak256(ethers.toUtf8Bytes("single-cred"));

  beforeEach(async function () {
    [, m1, m2, issuerA, issuerB, issuerAKey, issuerBKey] = await ethers.getSigners();
    ({ governance, anchor, revocation, naiveRevocation } = await deploySuite([m1.address, m2.address], 2));
    await onboardInstitution(governance, [m1, m2], issuerA, "did:vericred:issuerA", issuerAKey);
    await onboardInstitution(governance, [m1, m2], issuerB, "did:vericred:issuerB", issuerBKey);
  });

  for (const [name, getRegistry] of [
    ["RevocationRegistry (bitmap)", () => revocation],
    ["NaiveRevocationRegistry (mapping baseline)", () => naiveRevocation],
  ]) {
    describe(name, function () {
      it("reports not-revoked by default", async function () {
        await anchor.connect(issuerA).anchorBatch(root, 10, "u");
        const credId = encodeBatchCredential(0, 3);
        expect(await getRegistry().isRevoked(credId)).to.equal(false);
      });

      it("allows the issuing institution to revoke a batch-derived credential", async function () {
        await anchor.connect(issuerA).anchorBatch(root, 10, "u");
        const credId = encodeBatchCredential(0, 3);
        await expect(getRegistry().connect(issuerA).revoke(credId))
          .to.emit(getRegistry(), "CredentialRevoked")
          .withArgs(credId, issuerA.address);
        expect(await getRegistry().isRevoked(credId)).to.equal(true);
      });

      it("allows the issuing institution to revoke a single-issued credential", async function () {
        await anchor.connect(issuerA).issueSingle(credHash, "u");
        const credId = encodeSingleCredential(0);
        await getRegistry().connect(issuerA).revoke(credId);
        expect(await getRegistry().isRevoked(credId)).to.equal(true);
      });

      it("rejects revocation by an institution that did not issue the credential", async function () {
        await anchor.connect(issuerA).anchorBatch(root, 10, "u");
        const credId = encodeBatchCredential(0, 3);
        await expect(getRegistry().connect(issuerB).revoke(credId)).to.be.revertedWith(
          /caller is not the issuing institution/
        );
      });

      it("rejects revocation of a credential from a nonexistent batch", async function () {
        const credId = encodeBatchCredential(999, 0);
        await expect(getRegistry().connect(issuerA).revoke(credId)).to.be.revertedWith(
          "CredentialAnchor: unknown batch"
        );
      });

      it("does not let one batch's leaf indices collide with another batch's", async function () {
        await anchor.connect(issuerA).anchorBatch(root, 10, "u"); // batchId 0
        await anchor.connect(issuerB).anchorBatch(root, 10, "u"); // batchId 1
        const credFromA = encodeBatchCredential(0, 5);
        const credFromB = encodeBatchCredential(1, 5); // same leafIndex, different batch
        await getRegistry().connect(issuerA).revoke(credFromA);
        expect(await getRegistry().isRevoked(credFromA)).to.equal(true);
        expect(await getRegistry().isRevoked(credFromB)).to.equal(false);
      });

      it("leaves neighboring credentials in the same batch unrevoked", async function () {
        await anchor.connect(issuerA).anchorBatch(root, 300, "u"); // spans >1 bitmap slot
        const credId = encodeBatchCredential(0, 260); // slot 1, bit 4
        await getRegistry().connect(issuerA).revoke(credId);
        expect(await getRegistry().isRevoked(credId)).to.equal(true);
        expect(await getRegistry().isRevoked(encodeBatchCredential(0, 259))).to.equal(false);
        expect(await getRegistry().isRevoked(encodeBatchCredential(0, 4))).to.equal(false); // slot 0, bit 4
      });
    });
  }
});
