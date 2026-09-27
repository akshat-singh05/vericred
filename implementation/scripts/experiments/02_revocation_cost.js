const { ethers } = require("hardhat");
const { deploySuite, onboardInstitution } = require("../../test/helpers/deploy");
const { buildBatch } = require("../../offchain/issuance");
const { CredentialId } = require("../../offchain/credentialId");
const { writeCsv, GAS_PRICE_GWEI, ETH_USD_PRICE, ASSUMPTIONS_DATE, gasToUsd } = require("./_lib");

const REVOKE_COUNTS = [1, 10, 100];
// Disjoint id ranges per trial so each is a clean measurement from an unrevoked state,
// rather than re-revoking (idempotent, but would understate cold-SSTORE cost) overlapping ids.
const TOTAL_CREDENTIALS = REVOKE_COUNTS.reduce((a, b) => a + b, 0); // 111

function makeCohort(n) {
  const cohort = [];
  for (let i = 0; i < n; i++) {
    cohort.push({ subjectId: `did:example:student${i}`, fields: { name: `Student ${i}`, degree: "B.Tech" } });
  }
  return cohort;
}

async function revokeRange(registry, institution, batchId, startLeaf, count) {
  let totalGas = 0n;
  for (let i = 0; i < count; i++) {
    const credentialId = CredentialId.encodeBatchCredential(batchId, startLeaf + i);
    const tx = await registry.connect(institution).revoke(credentialId.toString());
    const receipt = await tx.wait();
    totalGas += receipt.gasUsed;
  }
  return totalGas;
}

async function main() {
  const [, m1, m2, institution] = await ethers.getSigners();
  const { anchor, governance, revocation, naiveRevocation } = await deploySuite([m1.address, m2.address], 2);
  const signingWallet = ethers.Wallet.createRandom();
  await onboardInstitution(governance, [m1, m2], institution, "did:vericred:bench", signingWallet);

  const cohort = makeCohort(TOTAL_CREDENTIALS);
  const batchBuild = await buildBatch(cohort, signingWallet, "did:vericred:bench", new Date().toISOString());
  const tx = await anchor.connect(institution).anchorBatch(batchBuild.batchRoot, TOTAL_CREDENTIALS, "demo://revocation-bench");
  const receipt = await tx.wait();
  const evt = receipt.logs.map((l) => { try { return anchor.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "BatchAnchored");
  const batchId = Number(evt.args.batchId);

  const rows = [];
  let cursor = 0;
  for (const n of REVOKE_COUNTS) {
    const start = cursor;
    cursor += n;

    const bitmapGas = await revokeRange(revocation, institution, batchId, start, n);
    const naiveGas = await revokeRange(naiveRevocation, institution, batchId, start, n);

    rows.push({
      credentialsRevoked: n,
      bitmapTotalGasUsed: bitmapGas.toString(),
      bitmapAvgGasPerCredential: (Number(bitmapGas) / n).toFixed(1),
      naiveTotalGasUsed: naiveGas.toString(),
      naiveAvgGasPerCredential: (Number(naiveGas) / n).toFixed(1),
      gasSavedTotal: (naiveGas - bitmapGas).toString(),
      gasSavedPercent: (((Number(naiveGas) - Number(bitmapGas)) / Number(naiveGas)) * 100).toFixed(2),
      bitmapTotalGasUsd: gasToUsd(bitmapGas).toFixed(4),
      naiveTotalGasUsd: gasToUsd(naiveGas).toFixed(4),
      gasPriceGwei: GAS_PRICE_GWEI,
      ethUsdPrice: ETH_USD_PRICE,
      assumptionsDate: ASSUMPTIONS_DATE,
    });
    console.log(`n=${n}: bitmap=${bitmapGas} naive=${naiveGas} saved=${(naiveGas - bitmapGas)} (${rows[rows.length - 1].gasSavedPercent}%)`);
  }

  writeCsv("revocation_cost.csv", rows);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
