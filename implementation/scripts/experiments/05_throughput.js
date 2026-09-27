// Plain Node script (not a Hardhat script) — exercises the live backend's
// real HTTP stack, so it must be run against `npm run node` + `npm run deploy`
// + `npm run backend` already running (see experiments/README.md).
const path = require("path");
const { writeCsv } = require("./_lib");

const API_BASE = process.env.VERICRED_API_BASE || "http://127.0.0.1:4000";
const CONCURRENCY_LEVELS = [10, 50, 100, 200];
const COHORT_SIZE = 5;

function percentile(sortedArr, p) {
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[idx];
}

async function jsonFetch(pathSuffix, options) {
  const res = await fetch(`${API_BASE}${pathSuffix}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `${pathSuffix} failed with ${res.status}`);
  return data;
}

async function setup() {
  await jsonFetch("/health");
  const { institutions } = await jsonFetch("/issuer/institutions");
  const institution = institutions.find((i) => i.active);
  if (!institution) throw new Error("No active institution found — run `npm run deploy` first");

  const cohort = [];
  for (let i = 0; i < COHORT_SIZE; i++) {
    cohort.push({
      subjectId: `did:example:throughput${i}`,
      fields: { name: `Throughput Student ${i}`, degree: "B.Tech", major: "CSE" },
    });
  }
  const { batchId } = await jsonFetch("/issuer/batches", {
    method: "POST",
    body: JSON.stringify({ institutionAddress: institution.institutionAddress, cohort, metadataURI: "demo://throughput-bench" }),
  });

  const { presentation } = await jsonFetch("/holder/disclosures", {
    method: "POST",
    body: JSON.stringify({ batchId, studentIndex: 0, disclosedFields: ["name", "degree"] }),
  });

  return presentation;
}

async function runLevel(presentation, concurrency) {
  const latencies = new Array(concurrency);
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async (_, i) => {
      const start = performance.now();
      const result = await jsonFetch("/verifier/verify", {
        method: "POST",
        body: JSON.stringify({ presentation }),
      });
      latencies[i] = performance.now() - start;
      if (!result.valid) throw new Error("unexpected invalid verification during throughput test");
    })
  );
  const totalMs = performance.now() - t0;
  const sorted = latencies.slice().sort((a, b) => a - b);
  return {
    concurrency,
    totalWallMs: totalMs.toFixed(2),
    requestsPerSec: ((concurrency / totalMs) * 1000).toFixed(2),
    latencyMs_p50: percentile(sorted, 50).toFixed(2),
    latencyMs_p95: percentile(sorted, 95).toFixed(2),
    latencyMs_p99: percentile(sorted, 99).toFixed(2),
    latencyMs_min: sorted[0].toFixed(2),
    latencyMs_max: sorted[sorted.length - 1].toFixed(2),
    errorRate: 0,
  };
}

async function main() {
  console.log("Setting up a demo batch + presentation via the live backend...");
  const presentation = await setup();

  const rows = [];
  for (const c of CONCURRENCY_LEVELS) {
    console.log(`Running ${c} concurrent verification requests...`);
    const row = await runLevel(presentation, c);
    rows.push(row);
    console.log(`  concurrency=${c} req/s=${row.requestsPerSec} p50=${row.latencyMs_p50}ms p95=${row.latencyMs_p95}ms p99=${row.latencyMs_p99}ms`);
  }

  writeCsv("throughput.csv", rows);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
