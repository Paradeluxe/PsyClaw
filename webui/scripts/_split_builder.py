"""
Builder frontend modularization helper.

Source of truth for edits:  frontend/builder-parts/*.js
Runtime bundle:             frontend/builder.js  (single IIFE, shared closure)

Usage:
  python webui/scripts/_split_builder.py --assemble
      Rebuild builder.js from builder-parts/ (normal maintainer path).

  python webui/scripts/_split_builder.py --split
      Split current builder.js into builder-parts/ then assemble
      (destructive re-cut by markers; prefer --assemble day-to-day).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend"
PARTS_DIR = ROOT / "builder-parts"
PART_NAMES = [
    "builder-part-model.js",
    "builder-part-display.js",
    "builder-part-ui.js",
    "builder-part-preview.js",
    "builder-part-boot.js",
]


def assemble() -> None:
    PARTS_DIR.mkdir(exist_ok=True)
    missing = [n for n in PART_NAMES if not (PARTS_DIR / n).is_file()]
    if missing:
        raise SystemExit(f"missing parts: {missing}")

    head = """/* psyclaw Builder — drag-drop design model + Flow tab UI
 *
 * window.PsyClawBuilder = {
 *   getDesign(), setDesign(d), resetDefault(),
 *   render(), selectComponent(id), selectRoutine(name)
 * }
 *
 * Modular source: frontend/builder-parts/*.js
 * Assemble: python webui/scripts/_split_builder.py --assemble
 */
"""
    body = []
    for name in PART_NAMES:
        chunk = (PARTS_DIR / name).read_text(encoding="utf-8")
        body.append(f"\n  // ---- {name} ----\n")
        body.append(chunk if chunk.endswith("\n") else chunk + "\n")

    out = head + "(function () {\n  'use strict';\n" + "".join(body) + "\n})();\n"
    (ROOT / "builder.js").write_text(out, encoding="utf-8", newline="\n")
    print(f"assembled {ROOT / 'builder.js'} ({len(out)} bytes) from {len(PART_NAMES)} parts")


def split_from_monolith() -> None:
    src_path = ROOT / "builder.js"
    if (ROOT / "builder.js.bak-before-split").is_file() and "builder-part-model" not in src_path.read_text(
        encoding="utf-8"
    )[:500]:
        pass
    src = src_path.read_text(encoding="utf-8")
    (ROOT / "builder.js.bak-before-split").write_text(src, encoding="utf-8", newline="\n")

    m2 = re.search(r"\(function\s*\(\s*\)\s*\{\s*'use strict';\s*", src)
    if not m2:
        raise SystemExit("cannot find IIFE start")
    body_start = m2.end()
    end = src.rfind("})();")
    if end < 0:
        raise SystemExit("cannot find IIFE end")
    body = src[body_start:end]
    lines = body.splitlines(keepends=True)

    def find(pred, start=0):
        for i in range(start, len(lines)):
            if pred(lines[i]):
                return i
        return -1

    i_display = find(lambda l: "var hostMonitors" in l or "Default window size = selected monitor" in l)
    i_palette = find(lambda l: "function renderPalette" in l)
    i_preview = find(
        lambda l: "Component stage preview" in l or "function stopComponentPreview" in l
    )
    i_boot = find(lambda l: "function boot()" in l)
    if min(i_display, i_palette, i_preview, i_boot) < 0:
        raise SystemExit(f"markers missing: display={i_display} palette={i_palette} preview={i_preview} boot={i_boot}")

    parts = {
        "builder-part-model.js": lines[:i_display],
        "builder-part-display.js": lines[i_display:i_palette],
        "builder-part-ui.js": lines[i_palette:i_preview],
        "builder-part-preview.js": lines[i_preview:i_boot],
        "builder-part-boot.js": lines[i_boot:],
    }
    PARTS_DIR.mkdir(exist_ok=True)
    for name, chunk in parts.items():
        (PARTS_DIR / name).write_text("".join(chunk), encoding="utf-8", newline="\n")
        print(f"wrote {name} ({len(chunk)} lines)")
    assemble()


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--assemble", action="store_true", help="parts → builder.js")
    g.add_argument("--split", action="store_true", help="builder.js → parts (re-cut)")
    args = ap.parse_args(argv)
    if args.assemble:
        assemble()
    else:
        split_from_monolith()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
