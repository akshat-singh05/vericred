import pandas as pd
from pathlib import Path
from style import new_figure, save, SERIES_STYLES

RESULTS = Path(__file__).parent.parent / "results" / "issuance_cost.csv"
OUT = Path(__file__).parent.parent.parent / "paper" / "figures" / "pdf" / "issuance_cost.pdf"

df = pd.read_csv(RESULTS)

fig, ax = new_figure()
ax.plot(df["batchSize"], df["individualTotalGasUsed_projected"], label="Individual issuance (baseline)", **SERIES_STYLES[1])
ax.plot(df["batchSize"], df["batchAnchorGasUsed"], label="Merkle-batched issuance (C1)", **SERIES_STYLES[0])
ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlabel("Cohort (batch) size")
ax.set_ylabel("On-chain gas used")
ax.legend(loc="lower right")
OUT.parent.mkdir(parents=True, exist_ok=True)
save(fig, OUT)
