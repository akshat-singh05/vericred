import pandas as pd
from pathlib import Path
from style import new_figure, save, SERIES_STYLES, FIG_DIR

RESULTS = Path(__file__).parent.parent / "results" / "revocation_cost.csv"
OUT = FIG_DIR / "revocation_cost.pdf"

df = pd.read_csv(RESULTS)

fig, ax = new_figure()
x = range(len(df))
width = 0.35
ax.bar([i - width / 2 for i in x], df["naiveTotalGasUsed"], width, label="Naive mapping (baseline)", color="0.65", edgecolor="0.1", hatch="//")
ax.bar([i + width / 2 for i in x], df["bitmapTotalGasUsed"], width, label="Bitmap registry (C2)", color="0.15", edgecolor="0.1")
ax.set_xticks(list(x))
ax.set_xticklabels(df["credentialsRevoked"])
ax.set_xlabel("Credentials revoked")
ax.set_ylabel("Total gas used")
ax.legend(loc="upper left")
OUT.parent.mkdir(parents=True, exist_ok=True)
save(fig, OUT)
