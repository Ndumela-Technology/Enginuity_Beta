"""Heuristic checks that generated projects match the selected engineering field."""

from __future__ import annotations

import re
from typing import Sequence

# Terms that strongly suggest the wrong discipline when a specific field is selected.
_FORBIDDEN_TERMS: dict[str, frozenset[str]] = {
    "aerospace": frozenset(
        {
            "bridge",
            "truss bridge",
            "arch bridge",
            "dam",
            "retaining wall",
            "foundation slab",
            "roadway",
            "highway",
            "culvert",
            "pier foundation",
        }
    ),
    "civil": frozenset(
        {
            "rocket",
            "spacecraft",
            "orbit",
            "jet engine",
            "airfoil",
            "parachute",
            "glider wing",
            "propeller plane",
        }
    ),
    "mechanical": frozenset(
        {
            "mobile app",
            "website",
            "python script",
            "machine learning",
            "neural network",
            "software program",
            "coding project",
        }
    ),
    "electrical": frozenset(
        {
            "mobile app",
            "website",
            "machine learning",
            "neural network",
            "software program",
            "coding project",
        }
    ),
}

_POSITIVE_HINTS: dict[str, frozenset[str]] = {
    "aerospace": frozenset(
        {
            "flight",
            "fly",
            "wing",
            "glider",
            "plane",
            "aircraft",
            "rocket",
            "rotor",
            "propeller",
            "parachute",
            "lift",
            "drag",
            "air",
            "aero",
        }
    ),
    "civil": frozenset(
        {
            "bridge",
            "tower",
            "arch",
            "beam",
            "truss",
            "structure",
            "load",
            "foundation",
            "column",
            "span",
        }
    ),
    "mechanical": frozenset(
        {
            "gear",
            "lever",
            "pulley",
            "linkage",
            "cart",
            "wheel",
            "catapult",
            "crank",
            "spring",
            "machine",
            "motor mount",
        }
    ),
    "electrical": frozenset(
        {
            "circuit",
            "led",
            "motor",
            "switch",
            "sensor",
            "wire",
            "battery",
            "conduct",
            "voltage",
            "current",
            "resistor",
        }
    ),
}

_FIELD_LABELS = {
    "aerospace": "Aerospace Engineering",
    "civil": "Civil Engineering",
    "mechanical": "Mechanical Engineering",
    "electrical": "Electrical Engineering",
}


def normalize_engineering_field(raw: str) -> str:
    """Return canonical field key or empty string."""
    text = (raw or "").strip().lower()
    text = re.sub(r"[^\w\s]", " ", text)
    if not text:
        return ""
    if "aerospace" in text or "aero" in text:
        return "aerospace"
    if "civil" in text:
        return "civil"
    if "electrical" in text or "electric" in text:
        return "electrical"
    if "mechanical" in text:
        return "mechanical"
    return ""


def check_field_alignment(project_text: str, engineering_field: str) -> tuple[float, list[str]]:
    """
    Return (score_ratio 0..1, issues).
    score_ratio 0 triggers validation retry when a field was explicitly selected.
    """
    key = normalize_engineering_field(engineering_field)
    if not key:
        return 1.0, []

    text = (project_text or "").lower()
    if not text.strip():
        return 1.0, []

    label = _FIELD_LABELS.get(key, engineering_field)
    issues: list[str] = []

    forbidden = _FORBIDDEN_TERMS.get(key, frozenset())
    hits = sorted({term for term in forbidden if term in text})
    if hits:
        issues.append(
            f"Project does not match {label}: off-discipline content ({', '.join(hits[:4])})."
        )
        return 0.0, issues

    hints = _POSITIVE_HINTS.get(key, frozenset())
    if hints and not any(hint in text for hint in hints):
        issues.append(
            f"Project may not clearly reflect {label} — add field-specific concepts."
        )
        return 0.55, issues

    return 1.0, issues


def extract_field_from_description(description: str) -> str:
    """Parse legacy 'Focus: …' lines from description text."""
    if not description:
        return ""
    match = re.search(
        r"(?:Focus|Engineering field focus|Engineering focus field):\s*([^\n.]+)",
        description,
        re.I,
    )
    return match.group(1).strip() if match else ""
