import pandas as pd
from pathlib import Path
from style import new_figure, save, SERIES_STYLES

RESULTS = Path(__file__).parent.parent / "results" / "throughput.csv"
OUT = Path(__file__).parent.parent.parent / "paper" / "figures" / "pdf" / "throughput.pdf"

df = pd.read_csv(RESULTS)

fig, ax = new_figure()
ax.plot(df["concurrency"], df["latencyMs_p50"], label="p50 latency", **SERIES_STYLES[0])
ax.plot(df["concurrency"], df["latencyMs_p95"], label="p95 latency", **SERIES_STYLES[1])
ax.set_xlabel("Concurrent verification clients")
ax.set_ylabel("Latency (ms)")

ax2 = ax.twinx()
ax2.plot(df["concurrency"], df["requestsPerSec"], label="Throughput (req/s)", **SERIES_STYLES[2])
ax2.set_ylabel("Throughput (req/s)")

lines1, labels1 = ax.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax.legend(lines1 + lines2, labels1 + labels2, loc="upper left")

OUT.parent.mkdir(parents=True, exist_ok=True)
save(fig, OUT)
