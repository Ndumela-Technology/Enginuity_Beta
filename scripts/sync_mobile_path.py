#!/usr/bin/env python3
"""Clean Inkscape mobile-home-path.svg and sync path d into site/index.html."""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "site" / "assets" / "mobile-home-path.svg"
INDEX_PATH = ROOT / "site" / "index.html"

SVG_NS = "http://www.w3.org/2000/svg"


def extract_path_d(svg_text: str) -> str:
    match = re.search(r'\bd="([^"]+)"', svg_text)
    if not match:
        raise SystemExit("Could not find path d= in SVG.")
    return match.group(1).strip()


def write_clean_svg(path_d: str) -> str:
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 400 720" preserveAspectRatio="none" xmlns="{SVG_NS}">
  <title>Mobile home path</title>
  <defs>
    <marker
      id="MobilePathArrow"
      refX="0"
      refY="0"
      orient="auto"
      markerWidth="6"
      markerHeight="6"
      viewBox="-3 -3 6 6"
    >
      <path
        d="M -2 0 L 2 0 M 0 -2 L 2 0 L 0 2"
        fill="none"
        stroke="#d81f26"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </marker>
  </defs>
  <path
    fill="none"
    stroke="#d81f26"
    stroke-width="3"
    vector-effect="non-scaling-stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.92"
    d="{path_d}"
    marker-end="url(#MobilePathArrow)"
  />
</svg>
'''


def sync_index(path_d: str) -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    pattern = (
        r'(<path\s+class="path-main path-main--mobile"[\s\S]*?\bd=")'
        r'[^"]*'
        r'(")'
    )
    updated, count = re.subn(pattern, rf"\1{path_d}\2", html, count=1)
    if count != 1:
        raise SystemExit("Could not update inline path in index.html.")
    INDEX_PATH.write_text(updated, encoding="utf-8", newline="\n")


def main() -> None:
    raw = SVG_PATH.read_text(encoding="utf-8")
    path_d = extract_path_d(raw)
    clean = write_clean_svg(path_d)
    ET.fromstring(clean)
    SVG_PATH.write_text(clean, encoding="utf-8", newline="\n")
    sync_index(path_d)
    print(f"Cleaned {SVG_PATH.name} and synced index.html")


if __name__ == "__main__":
    main()
