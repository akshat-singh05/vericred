const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("../../test/helpers/deploy");
const { buildBatch } = require("../../offchain/issuance");
const { buildSelectiveDisclosure } = require("../../offchain/disclosure");
const { verifyPresentation } = require("../../offchain/verifier");
const { writeCsv } = require("./_lib");

const BATCH_SIZES = [1, 10, 100, 500, 1000, 5000];
const TRIALS_PER_SIZE = 10;
const ALL_FIELDS = ["name", "degree", "major", "graduationYear", "gpa"];
const DISCLOSED_FIELDS = ["name", "degree", "major"];

function makeCohort(n) {
  const cohort = [];
  for (let i = 0; i < n; i++) {
    cohort.push({
      subjectId: `did:example:student${i}`,
      fields: { name: `Student ${i}`, degree: "B.Tech", major: "CSE", graduationYear: "2025", gpa: "8.5" },
    });
  }
  return cohort;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Instrumented copy of verifyPresentation's steps so we can time each phase
// separately without changing the production verifier's return shape.
async function timedVerify(presentation, contracts) {
  const t0 = performance.now();
  const issuerInstitutionAddress = await contracts.credentialAnchor.batchIssuerOf(presentation.batchId);
  await contracts.issuerRegistry.isActiveIssuer(issuerInstitutionAddress);
  const batchRoot = await contracts.credentialAnchor.getBatchRoot(presentation.batchId);
  const t1 = performance.now(); // end of on-chain reads for membership + root

  const batchTimestamp = await contracts.credentialAnchor.getBatchTimestamp(presentation.batchId);
  const expectedKey = await contracts.issuerRegistry.signingKeyAt(issuerInstitutionAddress, batchTimestamp);
  const recovered = ethers.verifyMessage(ethers.getBytes(batchRoot), presentation.batchSignature);
  const sigOk = recovered.toLowerCase() === expectedKey.toLowerCase();
  const t2 = performance.now(); // end of signature check

  const { hashField, buildMerkleTree, wrapAsBatchLeaf, verifyProof } = require("../../offchain/merkle");
  const leaves = presentation.fieldOrder.map((f) =>
    presentation.disclosedFields[f]
      ? hashField(f, presentation.disclosedFields[f].value, presentation.disclosedFields[f].salt)
      : presentation.undisclosedFieldHashes[f]
  );
  const { root: studentRoot } = buildMerkleTree(leaves);
  const included = verifyProof(wrapAsBatchLeaf(studentRoot), presentation.batchLeafProof, batchRoot);
  const t3 = performance.now(); // end of Merkle proof check

  const revoked = await contracts.revocationRegistry.isRevoked(presentation.credentialId);
  const t4 = performance.now(); // end of revocation check

  const valid = sigOk && included && !revoked && studentRoot.toLowerCase() === presentation.studentRoot.toLowerCase();
  return {
    valid,
    onChainReadMs: t1 - t0,
    signatureCheckMs: t2 - t1,
    merkleProofCheckMs: t3 - t2,
    revocationCheckMs: t4 - t3,
    totalMs: t4 - t0,
  };
}

async function main() {
  const [, m1, m2, institution] = await ethers.getSigners();
  const suite = await deploySuite([m1.address, m2.address], 2);
  const { anchor, governance, issuerRegistry, revocation } = suite;
  const signingWallet = ethers.Wallet.createRandom();
  await onboardInstitution(governance, [m1, m2], institution, "did:vericred:bench", signingWallet);

  const contracts = { issuerRegistry, credentialAnchor: anchor, revocationRegistry: revocation };
  const rows = [];

  for (const n of BATCH_SIZES) {
    const cohort = makeCohort(n);
    const batchBuild = await buildBatch(cohort, signingWallet, "did:vericred:bench", new Date().toISOString());
    const tx = await anchor.connect(institution).anchorBatch(batchBuild.batchRoot, n, "demo://latency-bench");
    const receipt = await tx.wait();
    const evt = receipt.logs.map((l) => { try { return anchor.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "BatchAnchored");
    const batchId = Number(evt.args.batchId);

    const proofLength = Math.ceil(Math.log2(Math.max(n, 2)));
    const trials = [];
    for (let t = 0; t < TRIALS_PER_SIZE; t++) {
      const studentIndex = Math.floor(Math.random() * n);
      const presentation = buildSelectiveDisclosure(batchBuild, studentIndex, DISCLOSED_FIELDS, batchId);
      const timing = await timedVerify(presentation, contracts);
      if (!timing.valid) throw new Error(`unexpected invalid presentation at n=${n}, trial=${t}`);
      trials.push(timing);
    }

    rows.push({
      batchSize: n,
      expectedProofLength_log2n: proofLength,
      actualBatchLeafProofLength: JSON.parse(
        JSON.stringify(buildSelectiveDisclosure(batchBuild, 0, DISCLOSED_FIELDS, batchId).batchLeafProof)
      ).length,
      onChainReadMs_avg: mean(trials.map((t) => t.onChainReadMs)).toFixed(3),
      signatureCheckMs_avg: mean(trials.map((t) => t.signatureCheckMs)).toFixed(3),
      merkleProofCheckMs_avg: mean(trials.map((t) => t.merkleProofCheckMs)).toFixed(3),
      revocationCheckMs_avg: mean(trials.map((t) => t.revocationCheckMs)).toFixed(3),
      totalMs_avg: mean(trials.map((t) => t.totalMs)).toFixed(3),
      totalMs_min: Math.min(...trials.map((t) => t.totalMs)).toFixed(3),
      totalMs_max: Math.max(...trials.map((t) => t.totalMs)).toFixed(3),
      trials: TRIALS_PER_SIZE,
    });
    console.log(`batchSize=${n} proofLen=${rows[rows.length - 1].actualBatchLeafProofLength} totalMs_avg=${rows[rows.length - 1].totalMs_avg}`);
  }

  writeCsv("verification_latency.csv", rows);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
