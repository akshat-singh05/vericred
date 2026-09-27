import pandas as pd
from pathlib import Path
from style import new_figure, save, SERIES_STYLES

RESULTS = Path(__file__).parent.parent / "results" / "selective_disclosure_overhead.csv"
OUT = Path(__file__).parent.parent.parent / "paper" / "figures" / "pdf" / "selective_disclosure_overhead.pdf"

df = pd.read_csv(RESULTS)

fig, ax = new_figure()
ax.plot(df["disclosedFieldCount"], df["presentationSizeBytes_avg"], label="Presentation size (bytes)", **SERIES_STYLES[0])
ax.set_xlabel("Disclosed fields (of 8 total)")
ax.set_ylabel("Presentation size (bytes)")

ax2 = ax.twinx()
ax2.plot(df["disclosedFieldCount"], df["verificationTimeMs_avg"], label="Verification time (ms)", **SERIES_STYLES[1])
ax2.set_ylabel("Verification time (ms)")

lines1, labels1 = ax.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax.legend(lines1 + lines2, labels1 + labels2, loc="upper left")

OUT.parent.mkdir(parents=True, exist_ok=True)
save(fig, OUT)
