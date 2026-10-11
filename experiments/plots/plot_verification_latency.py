import pandas as pd
from pathlib import Path
from style import new_figure, save, SERIES_STYLES, FIG_DIR

RESULTS = Path(__file__).parent.parent / "results" / "verification_latency.csv"
OUT_STACK = FIG_DIR / "verification_latency_breakdown.pdf"
OUT_PROOF = FIG_DIR / "verification_proof_length.pdf"

df = pd.read_csv(RESULTS)

# Figure A: stacked latency breakdown by phase, across batch sizes
fig, ax = new_figure()
x = range(len(df))
bottom = [0] * len(df)
phases = [
    ("onChainReadMs_avg", "On-chain read"),
    ("signatureCheckMs_avg", "Signature check"),
    ("merkleProofCheckMs_avg", "Merkle proof check"),
    ("revocationCheckMs_avg", "Revocation check"),
]
grays = ["0.1", "0.35", "0.55", "0.75"]
hatches = [None, "//", "xx", ".."]
for (col, label), gray, hatch in zip(phases, grays, hatches):
    ax.bar(list(x), df[col], bottom=bottom, label=label, color=gray, edgecolor="0.05", linewidth=0.3, hatch=hatch)
    bottom = [b + v for b, v in zip(bottom, df[col])]
ax.set_xticks(list(x))
ax.set_xticklabels(df["batchSize"])
ax.set_xlabel("Cohort (batch) size")
ax.set_ylabel("Verification latency (ms)")
ax.legend(loc="upper left", ncol=1)
OUT_STACK.parent.mkdir(parents=True, exist_ok=True)
save(fig, OUT_STACK)

# Figure B: Merkle proof length vs. batch size, log-x, showing O(log n) growth
fig2, ax2 = new_figure()
ax2.plot(df["batchSize"], df["actualBatchLeafProofLength"], **SERIES_STYLES[0])
ax2.set_xscale("log")
ax2.set_xlabel("Cohort (batch) size")
ax2.set_ylabel("Batch-level Merkle proof length (hashes)")
save(fig2, OUT_PROOF)
