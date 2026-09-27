"""Shared matplotlib style for all VeriCred figures.

Design goals (see PLAN.md Phase 3): vector PDF output, serif font matching
IEEEtran body text, legible at single-column width (3.5in), distinguishable
in grayscale printing (so every series gets both a distinct marker/linestyle
AND a distinct gray level, never color alone).
"""
import matplotlib
matplotlib.use("pdf")
import matplotlib.pyplot as plt

SINGLE_COL_WIDTH_IN = 3.5
SINGLE_COL_HEIGHT_IN = 2.6

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman", "Times", "DejaVu Serif"],
    "font.size": 8,
    "axes.titlesize": 8,
    "axes.labelsize": 8,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "legend.fontsize": 6.5,
    "lines.linewidth": 1.3,
    "lines.markersize": 4,
    "axes.grid": True,
    "grid.linewidth": 0.4,
    "grid.alpha": 0.5,
    "axes.axisbelow": True,
    "pdf.fonttype": 42,  # embed as Type1-compatible outlines, not bitmap
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.02,
})

# Grayscale-distinguishable series styling: (linestyle, marker, gray level)
SERIES_STYLES = [
    dict(linestyle="-", marker="o", color="0.05"),
    dict(linestyle="--", marker="s", color="0.35"),
    dict(linestyle="-.", marker="^", color="0.55"),
    dict(linestyle=":", marker="D", color="0.7"),
]


def new_figure(width=SINGLE_COL_WIDTH_IN, height=SINGLE_COL_HEIGHT_IN):
    fig, ax = plt.subplots(figsize=(width, height))
    return fig, ax


def save(fig, out_path):
    fig.savefig(out_path)
    print(f"Wrote {out_path}")
