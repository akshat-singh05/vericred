const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "..", "..", "experiments", "results");

function writeCsv(filename, rows) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (rows.length === 0) throw new Error(`writeCsv(${filename}): no rows`);
  const header = Object.keys(rows[0]);
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => r[h]).join(","))];
  const outPath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`Wrote ${rows.length} rows to experiments/results/${filename}`);
}

// Illustrative, explicitly-stated cost-conversion assumptions — the primary deployment target is the
// gas-free permissioned consortium network; USD figures are only for the secondary
// public-L1/L2 cost comparison, and are NOT live-fetched market data.
const GAS_PRICE_GWEI = 20;
const ETH_USD_PRICE = 3000;
const ASSUMPTIONS_DATE = new Date().toISOString().slice(0, 10);

function gasToUsd(gas) {
  const gwei = Number(gas) * GAS_PRICE_GWEI;
  const eth = gwei / 1e9;
  return eth * ETH_USD_PRICE;
}

module.exports = { RESULTS_DIR, writeCsv, GAS_PRICE_GWEI, ETH_USD_PRICE, ASSUMPTIONS_DATE, gasToUsd };
