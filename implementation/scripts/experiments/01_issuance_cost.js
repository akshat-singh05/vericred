const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("../../test/helpers/deploy");
const { buildBatch } = require("../../offchain/issuance");
const { writeCsv, GAS_PRICE_GWEI, ETH_USD_PRICE, ASSUMPTIONS_DATE, gasToUsd } = require("./_lib");

const BATCH_SIZES = [1, 10, 100, 500, 1000, 5000];
const INDIVIDUAL_SAMPLES = 30;

function makeCohort(n) {
  const cohort = [];
  for (let i = 0; i < n; i++) {
    cohort.push({
      subjectId: `did:example:student${i}`,
      fields: {
        name: `Student ${i}`,
        degree: "B.Tech",
        major: "CSE",
        graduationYear: "2025",
        gpa: (7 + (i % 3)).toFixed(1),
      },
    });
  }
  return cohort;
}

async function main() {
  const [, m1, m2, institution] = await ethers.getSigners();
  const { anchor, governance } = await deploySuite([m1.address, m2.address], 2);
  const signingWallet = ethers.Wallet.createRandom();
  await onboardInstitution(governance, [m1, m2], institution, "did:vericred:bench", signingWallet);

  console.log(`Sampling individual issuance gas over ${INDIVIDUAL_SAMPLES} calls...`);
  const individualGasSamples = [];
  for (let i = 0; i < INDIVIDUAL_SAMPLES; i++) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(`individual-cred-${i}`));
    const tx = await anchor.connect(institution).issueSingle(hash, "demo://individual");
    const receipt = await tx.wait();
    individualGasSamples.push(Number(receipt.gasUsed));
  }
  const avgIndividualGas = individualGasSamples.reduce((a, b) => a + b, 0) / individualGasSamples.length;
  const minIndividualGas = Math.min(...individualGasSamples);
  const maxIndividualGas = Math.max(...individualGasSamples);
  console.log(
    `Individual issuance gas: avg=${avgIndividualGas.toFixed(1)} min=${minIndividualGas} max=${maxIndividualGas} (n=${INDIVIDUAL_SAMPLES})`
  );

  const rows = [];
  for (const n of BATCH_SIZES) {
    const cohort = makeCohort(n);
    const t0 = Date.now();
    const batchBuild = await buildBatch(cohort, signingWallet, "did:vericred:bench", new Date().toISOString());
    const offchainBuildMs = Date.now() - t0;

    const tx = await anchor.connect(institution).anchorBatch(batchBuild.batchRoot, n, "demo://batch");
    const receipt = await tx.wait();
    const batchGas = Number(receipt.gasUsed);
    const individualTotalGas = avgIndividualGas * n;

    rows.push({
      batchSize: n,
      batchAnchorGasUsed: batchGas,
      individualTotalGasUsed_projected: Math.round(individualTotalGas),
      individualPerCredentialGas_avg: Math.round(avgIndividualGas),
      individualPerCredentialGas_min: minIndividualGas,
      individualPerCredentialGas_max: maxIndividualGas,
      batchAnchorGasUsd: gasToUsd(batchGas).toFixed(4),
      individualTotalGasUsd_projected: gasToUsd(individualTotalGas).toFixed(4),
      offchainMerkleBuildMs: offchainBuildMs,
      gasPriceGwei: GAS_PRICE_GWEI,
      ethUsdPrice: ETH_USD_PRICE,
      assumptionsDate: ASSUMPTIONS_DATE,
    });
    console.log(`batchSize=${n} batchAnchorGasUsed=${batchGas} offchainMerkleBuildMs=${offchainBuildMs}`);
  }

  writeCsv("issuance_cost.csv", rows);
  console.log(
    "\nMethodology note: individualTotalGasUsed_projected = (measured mean per-call gas) * batchSize. " +
      "issueSingle() has no state-dependent branching (see contracts/CredentialAnchor.sol), so per-call gas " +
      "is constant regardless of how many single credentials have already been issued; we verified this " +
      `empirically (min=${minIndividualGas}, max=${maxIndividualGas}, spread=${maxIndividualGas - minIndividualGas} gas ` +
      "across 30 samples) rather than assuming it, then project the total linearly instead of spending N real " +
      "transactions on a value that direct measurement already shows is constant."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
