import pandas as pd
from pathlib import Path
from style import new_figure, save, FIG_DIR

RESULTS = Path(__file__).parent.parent / "results" / "governance_cost.csv"
OUT = FIG_DIR / "governance_cost.pdf"

df = pd.read_csv(RESULTS)
labels = [f"{m}-of-{n}" for m, n in zip(df["threshold_M"], df["totalMembers_N"])]

fig, ax = new_figure()
x = range(len(df))
ax.bar(x, df["totalGasUsed"], color="0.2", edgecolor="0.05")
ax.set_xticks(list(x))
ax.set_xticklabels(labels)
ax.set_xlabel("Governance threshold (M-of-N)")
ax.set_ylabel("Total gas to onboard one issuer")

ax2 = ax.twinx()
ax2.plot(x, df["transactionsNeeded"], color="0.0", marker="o", linestyle="--", linewidth=1.2, markersize=4)
ax2.set_ylabel("Transactions needed")
ax2.set_ylim(0, max(df["transactionsNeeded"]) + 1)

OUT.parent.mkdir(parents=True, exist_ok=True)
save(fig, OUT)
