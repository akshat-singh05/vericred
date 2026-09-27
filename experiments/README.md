# VeriCred — experiments

Real benchmarks against the deployed contracts/backend in
[../implementation](../implementation). No numbers in `results/*.csv` are
invented — anything that couldn't be run is left as `TBD — not run` and
called out explicitly (see "What was not run" below).

## Reproducing

From `implementation/`:

```bash
# Experiments 1, 2, 3, 4, 6 are self-contained Hardhat scripts (spin up
# their own in-process network each run — no separate node needed):
npx hardhat run scripts/experiments/01_issuance_cost.js
npx hardhat run scripts/experiments/02_revocation_cost.js
npx hardhat run scripts/experiments/03_verification_latency.js
npx hardhat run scripts/experiments/04_selective_disclosure_overhead.js
npx hardhat run scripts/experiments/06_governance_cost.js

# Experiment 5 (throughput) exercises the real HTTP backend, so it needs
# the full dev stack running first (see ../implementation/README.md):
#   terminal A: npm run node
#   terminal B: npm run deploy
#   terminal C: npm run backend
#   terminal D:
node scripts/experiments/05_throughput.js
```

Each script overwrites its corresponding `experiments/results/*.csv`.

## Generating plots

```bash
python -m pip install matplotlib pandas numpy   # once
cd experiments/plots
python plot_issuance_cost.py
python plot_revocation_cost.py
python plot_verification_latency.py
python plot_selective_disclosure_overhead.py
python plot_throughput.py
python plot_governance_cost.py
```

Writes vector PDFs to `../../paper/figures/pdf/`, styled per `style.py`
(serif font matching IEEEtran body text, single-column width, distinct
marker+linestyle+gray-level per series so figures stay legible printed in
grayscale).

## What each CSV contains and how to read it

- **issuance_cost.csv** — gas for individual (`issueSingle`) vs.
  Merkle-batched (`anchorBatch`) issuance across cohort sizes
  {1,10,100,500,1000,5000}. `individualTotalGasUsed_projected` is the
  measured mean per-call gas (30 real samples) × cohort size, not N separate
  transactions — `issueSingle` has no state-dependent branching, so its
  per-call cost is provably constant and we verified that empirically
  (min/max spread reported in the same row) rather than assuming it. The
  batch figure (`batchAnchorGasUsed`) is measured directly at every cohort
  size with a real Merkle tree of that size. USD columns use the stated
  gas-price/ETH-price assumptions in the same row (illustrative, dated, not
  live-fetched — see `implementation/scripts/experiments/_lib.js`).
- **revocation_cost.csv** — bitmap (`RevocationRegistry`) vs. naive mapping
  (`NaiveRevocationRegistry`) total gas to revoke {1,10,100} credentials,
  each trial using a disjoint credential-id range so no trial benefits from
  a previous trial's warm storage access. The realized savings (~32% at
  n=10/100, ~0% at n=1) is **smaller than the naive "256 credentials per
  slot" intuition would suggest** — see the paper's Protocol/Security
  section for why: EIP-2929/EIP-3529 price a zero→nonzero SSTORE
  (`SSTORE_SET`, ~20000 gas) far higher than a nonzero→nonzero SSTORE within
  an already-touched word (~2900–5000 gas), so the bitmap only wins once a
  slot's first bit has already paid the zero→nonzero cost.
- **verification_latency.csv** — mean of 10 trials per batch size, phase
  breakdown from an instrumented copy of `offchain/verifier.js`'s exact
  steps (see `03_verification_latency.js`). `signatureCheckMs_avg` includes
  two on-chain reads (`getBatchTimestamp`, `signingKeyAt`) plus the ECDSA
  recovery itself, not recovery alone — documented here because the column
  name alone doesn't make that explicit. `actualBatchLeafProofLength` is the
  real Merkle proof length returned by `disclosure.js`, shown against
  `expectedProofLength_log2n` = ⌈log₂(batchSize)⌉ for comparison.
- **selective_disclosure_overhead.csv** — presentation size (bytes, wire
  format excluding the display-only VC template) and verification time vs.
  number of disclosed fields, out of a fixed 8-field schema, at a fixed
  cohort size of 1000 (so the batch-level proof length is constant and this
  isolates the field-count effect).
- **throughput.csv** — real concurrent HTTP load against the running
  Express backend + Hardhat JSON-RPC node, {10,50,100,200} simultaneous
  `POST /verifier/verify` requests. Throughput plateaus around 24–34 req/s
  regardless of concurrency while p50/p95 latency grows roughly linearly —
  this reflects the backend issuing 6 sequential on-chain reads per
  verification with no caching, not a fundamental protocol limit; see
  Limitations.
- **governance_cost.csv** — gas and transaction count to onboard one issuer
  under different M-of-N settings, each on a freshly deployed
  `ConsortiumGovernance` instance so results aren't affected by prior state.
- **comparative_analysis.csv** — qualitative feature comparison against the
  systems surveyed in PLAN.md §1 (not experimentally measured; sourced from
  each system's own documentation/paper, cited in `source`).

## What was not run

Nothing in this round required a public testnet deployment; the primary
deployment target is the gas-free permissioned network per PLAN.md §3, and
the public-L2 cost comparison mentioned there is deferred — if pursued, its
numbers will replace this line with real testnet-measured figures rather
than an estimate.
