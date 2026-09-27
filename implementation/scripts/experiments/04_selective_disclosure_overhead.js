const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("../../test/helpers/deploy");
const { buildBatch } = require("../../offchain/issuance");
const { buildSelectiveDisclosure } = require("../../offchain/disclosure");
const { verifyPresentation } = require("../../offchain/verifier");
const { writeCsv } = require("./_lib");

const FIXED_BATCH_SIZE = 1000; // representative cohort size; proof length here is fixed (~O(log n)) so this isolates field-count overhead
const SCHEMA_FIELDS = ["name", "degree", "major", "minor", "graduationYear", "gpa", "honors", "studentId"];
const TRIALS_PER_COUNT = 10;

function makeCohort(n) {
  const cohort = [];
  for (let i = 0; i < n; i++) {
    cohort.push({
      subjectId: `did:example:student${i}`,
      fields: {
        name: `Student ${i}`,
        degree: "B.Tech",
        major: "CSE",
        minor: "Data Science",
        graduationYear: "2025",
        gpa: "8.5",
        honors: "Dean's List",
        studentId: `VIT${1000 + i}`,
      },
    });
  }
  return cohort;
}

function presentationWireSize(presentation) {
  const { credentialDocumentTemplate, ...wire } = presentation;
  return Buffer.byteLength(JSON.stringify(wire));
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function main() {
  const [, m1, m2, institution] = await ethers.getSigners();
  const suite = await deploySuite([m1.address, m2.address], 2);
  const { anchor, governance, issuerRegistry, revocation } = suite;
  const signingWallet = ethers.Wallet.createRandom();
  await onboardInstitution(governance, [m1, m2], institution, "did:vericred:bench", signingWallet);

  const cohort = makeCohort(FIXED_BATCH_SIZE);
  const batchBuild = await buildBatch(cohort, signingWallet, "did:vericred:bench", new Date().toISOString());
  const tx = await anchor.connect(institution).anchorBatch(batchBuild.batchRoot, FIXED_BATCH_SIZE, "demo://disclosure-bench");
  const receipt = await tx.wait();
  const evt = receipt.logs.map((l) => { try { return anchor.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "BatchAnchored");
  const batchId = Number(evt.args.batchId);

  const contracts = { issuerRegistry, credentialAnchor: anchor, revocationRegistry: revocation };
  const rows = [];

  for (let disclosedCount = 1; disclosedCount <= SCHEMA_FIELDS.length; disclosedCount++) {
    const disclosedFields = SCHEMA_FIELDS.slice(0, disclosedCount);
    const sizes = [];
    const times = [];
    for (let t = 0; t < TRIALS_PER_COUNT; t++) {
      const studentIndex = Math.floor(Math.random() * FIXED_BATCH_SIZE);
      const presentation = buildSelectiveDisclosure(batchBuild, studentIndex, disclosedFields, batchId);
      sizes.push(presentationWireSize(presentation));

      const t0 = performance.now();
      const result = await verifyPresentation(presentation, contracts);
      const t1 = performance.now();
      if (!result.valid) throw new Error(`unexpected invalid presentation at disclosedCount=${disclosedCount}`);
      times.push(t1 - t0);
    }

    rows.push({
      totalSchemaFields: SCHEMA_FIELDS.length,
      disclosedFieldCount: disclosedCount,
      undisclosedFieldCount: SCHEMA_FIELDS.length - disclosedCount,
      presentationSizeBytes_avg: Math.round(mean(sizes)),
      presentationSizeBytes_min: Math.min(...sizes),
      presentationSizeBytes_max: Math.max(...sizes),
      verificationTimeMs_avg: mean(times).toFixed(3),
      batchSizeUsed: FIXED_BATCH_SIZE,
      trials: TRIALS_PER_COUNT,
    });
    console.log(`disclosed=${disclosedCount}/${SCHEMA_FIELDS.length} avgBytes=${rows[rows.length - 1].presentationSizeBytes_avg} avgMs=${rows[rows.length - 1].verificationTimeMs_avg}`);
  }

  writeCsv("selective_disclosure_overhead.csv", rows);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
