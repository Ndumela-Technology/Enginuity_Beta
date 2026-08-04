"""Build Concept Render image prompts with a strict label manifest from build steps."""

from __future__ import annotations

import re
from typing import Any, Mapping

from prompt.prompts import CONCEPT_RENDER_STYLE


def _material_core(material: str) -> str:
    text = str(material or "").strip().lower()
    text = re.sub(r"^[\d]+\s*[x×]\s*", "", text)
    text = re.sub(r"^\d+\s+", "", text)
    return text.strip()


def _material_in_step(material: str, step: str) -> bool:
    core = _material_core(material)
    if not core or len(core) < 2:
        return False
    hay = step.lower()
    if core in hay:
        return True
    tokens = [t for t in re.split(r"[\s,/]+", core) if len(t) >= 4]
    return any(token in hay for token in tokens)


def _extract_dimensions(text: str) -> list[str]:
    if not text:
        return []
    found: list[str] = []
    seen: set[str] = set()
    consumed_spans: list[tuple[int, int]] = []

    def overlaps(start: int, end: int) -> bool:
        return any(s < end and start < e for s, e in consumed_spans)

    def add(dim: str, start: int = -1, end: int = -1) -> None:
        dim = dim.strip()
        if not dim or dim in seen:
            return
        seen.add(dim)
        found.append(dim)
        if start >= 0 and end > start:
            consumed_spans.append((start, end))

    for match in re.finditer(
        r"(\d+(?:\.\d+)?)\s*cm\s*(?:by|×|x)\s*(\d+(?:\.\d+)?)\s*cm",
        text,
        re.I,
    ):
        add(
            f"{match.group(1)} cm × {match.group(2)} cm",
            match.start(),
            match.end(),
        )

    for match in re.finditer(r"(\d+)\s*[-–]\s*(\d+)\s*cm", text, re.I):
        if overlaps(match.start(), match.end()):
            continue
        add(f"{match.group(1)}–{match.group(2)} cm", match.start(), match.end())

    for match in re.finditer(
        r"(?:about|approximately|roughly|around)?\s*(\d+(?:\.\d+)?)\s*cm\b",
        text,
        re.I,
    ):
        if overlaps(match.start(), match.end()):
            continue
        add(f"{match.group(1)} cm", match.start(), match.end())

    return found


def _visual_profile(material: str) -> dict[str, str]:
    """How to draw + where the label may appear (prevents verb 'tape' mislabels)."""
    core = _material_core(material)

    profiles = {
        "tape": {
            "draw_as": "ONE small thin adhesive STRIP (short narrow rectangle, semi-transparent)",
            "label_only_on": "the small strip piece ONLY — never on large boards, wings, body, or sticks",
            "never_label": "cardboard, paper sheets, toothpicks, rods, bases, elastic bands",
        },
        "toothpick": {
            "draw_as": "thin straight wooden ROD / stick (vertical or horizontal cylinder)",
            "label_only_on": "the stick/rod shape ONLY — never on flat sheets or strips",
            "never_label": "tape strips, paper sheets, cardboard boards, elastic loops",
        },
        "paper": {
            "draw_as": "flat rectangular SHEET (white or light color)",
            "label_only_on": "flat sheet pieces including body and wings cut from paper",
            "never_label": "tape, toothpicks, elastic bands — a wing is still PAPER",
        },
        "cardboard": {
            "draw_as": "flat rectangular BOARD or sheet (tan/brown, thicker than paper)",
            "label_only_on": "flat board/body pieces — the main structural base",
            "never_label": "tape, toothpicks — the base is CARDBOARD/PAPER not TAPE",
        },
        "elastic": {
            "draw_as": "rubber LOOP or band (oval/ring shape)",
            "label_only_on": "the loop/band ONLY",
            "never_label": "sticks, sheets, tape, boards",
        },
        "rubber band": {
            "draw_as": "rubber LOOP or band",
            "label_only_on": "the loop/band ONLY",
            "never_label": "sticks, sheets, tape, boards",
        },
    }

    for key, profile in profiles.items():
        if key in core or core in key:
            return profile

    return {
        "draw_as": f"simple recognizable shape for {material}",
        "label_only_on": f"the part made of {material} only",
        "never_label": "other materials from the manifest",
    }


def _tape_attachment_rules(steps: list[str]) -> list[str]:
    """Steps like 'Tape wing to body' — wing/body are NOT labeled TAPE."""
    rules: list[str] = []
    for step in steps:
        lower = step.lower()
        if re.search(r"\btape\b", lower) and re.search(
            r"\b(wing|body|base|frame|rod|stick|board|sheet|paper|cardboard)\b", lower
        ):
            rules.append(
                f'In "{step[:100]}": the wing/body/board being attached is NOT "TAPE" — '
                "only a separate thin strip may be labeled TAPE."
            )
    return rules[:6]


def _display_label(material: str) -> str:
    label = str(material or "").strip()
    if not label:
        return ""
    return label.upper() if len(label) <= 28 else label


def build_label_manifest(
    materials: list[str],
    phase_steps: list[str],
    all_steps: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Map each project material to an exact label + dimensions quoted from steps.
    Scans phase steps first, then remaining steps for sizing context.
    """
    phase_steps = [str(s).strip() for s in phase_steps if str(s).strip()]
    rest = [str(s).strip() for s in (all_steps or []) if str(s).strip()]
    scan_order = phase_steps + [s for s in rest if s not in phase_steps]

    manifest: list[dict[str, Any]] = []
    used_labels: set[str] = set()

    for material in materials:
        core = _material_core(material)
        if not core:
            continue
        label = _display_label(material)
        if not label or label.lower() in used_labels:
            continue

        best_entry: dict[str, Any] | None = None
        for step in scan_order:
            if not _material_in_step(material, step):
                continue
            dims = _extract_dimensions(step)
            profile = _visual_profile(material)
            entry = {
                "label": label,
                "material": material.strip(),
                "dimensions": dims,
                "step_snippet": step[:180],
                "draw_as": profile.get("draw_as", ""),
                "label_only_on": profile.get("label_only_on", ""),
                "never_label": profile.get("never_label", ""),
            }
            if dims and not best_entry:
                best_entry = entry
            elif not best_entry:
                best_entry = entry

        if best_entry:
            manifest.append(best_entry)
            used_labels.add(label.lower())

    for material in materials:
        label = _display_label(material)
        if label and label.lower() not in used_labels:
            manifest.append(
                {
                    "label": label,
                    "material": material.strip(),
                    "dimensions": [],
                    "step_snippet": "",
                    **_visual_profile(material),
                }
            )
            used_labels.add(label.lower())

    return manifest


def _format_manifest_block(
    manifest: list[dict[str, Any]], phase_steps: list[str] | None = None
) -> str:
    if not manifest:
        return (
            "- Use ONLY names from the project materials list.\n"
            "- Do not invent dimensions — omit size callouts if not provided in steps."
        )

    simplify = len(manifest) > 4
    lines = [
        "MANDATORY LABEL MANIFEST — one label per material type; match shape to label:",
        "Each material appears AT MOST ONCE in the diagram labels.",
    ]
    if simplify:
        lines.append(
            "SIMPLIFY: mild 3D isometric view with 4–6 floating parts max — one label each, no duplicate labels."
        )

    for i, item in enumerate(manifest, 1):
        label = item.get("label") or "PART"
        dims = item.get("dimensions") or []
        dim_text = (
            f" Size callout: {', '.join(dims)}."
            if dims
            else " No size callout unless listed here."
        )
        draw_as = item.get("draw_as") or ""
        label_on = item.get("label_only_on") or ""
        never = item.get("never_label") or ""
        lines.append(f'{i}. "{label}" — draw as: {draw_as}.{dim_text}')
        if label_on:
            lines.append(f"   Label ONLY ON: {label_on}.")
        if never:
            lines.append(f'   NEVER put "{label}" on: {never}.')

    tape_rules = _tape_attachment_rules(phase_steps or [])
    if tape_rules:
        lines.append("")
        lines.append("TAPE vs ATTACHED PARTS (critical — 'tape' in a step is a verb):")
        lines.extend(f"- {r}" for r in tape_rules)

    lines.extend(
        [
            "",
            "LABEL PLACEMENT RULES:",
            "- Large flat body/base/board = PAPER or CARDBOARD label — NEVER TAPE.",
            "- Small thin strip = TAPE label (show ONE strip, not on every joint).",
            "- Thin rod/stick = TOOTHPICK label — NEVER on flat sheets.",
            "- Flat sheet with size = PAPER label — wings/body cut from paper are PAPER.",
            "- Loop/ring = ELASTIC BAND label.",
            "- Do not repeat the same label on multiple unrelated shapes.",
            "- Dimensions: use manifest sizes only — never invent.",
        ]
    )
    return "\n".join(lines)


def build_concept_render_prompt(data: Mapping[str, Any]) -> str:
    title = str((data or {}).get("title") or "").strip()
    description = str((data or {}).get("description") or "").strip()
    materials = (data or {}).get("materials") or []
    if not isinstance(materials, list):
        materials = [str(materials)]
    materials = [str(m).strip() for m in materials if str(m).strip()]

    phase_name = str((data or {}).get("phase_name") or "Build").strip()
    phase_title = str((data or {}).get("phase_title") or phase_name).strip()
    phase_steps = (data or {}).get("phase_steps") or []
    if not isinstance(phase_steps, list):
        phase_steps = []
    phase_steps = [str(s).strip() for s in phase_steps if str(s).strip()]

    all_steps = (data or {}).get("all_steps") or []
    if not isinstance(all_steps, list):
        all_steps = []
    all_steps = [str(s).strip() for s in all_steps if str(s).strip()]

    try:
        phase_index = int((data or {}).get("phase_index", 0))
    except (TypeError, ValueError):
        phase_index = 0
    try:
        total_phases = int((data or {}).get("total_phases") or 1)
    except (TypeError, ValueError):
        total_phases = 1

    materials_line = ", ".join(materials) if materials else "materials from the project list only"
    phase_steps_block = (
        "\n".join(f"- {s}" for s in phase_steps)
        if phase_steps
        else "- (follow the phase focus below)"
    )
    prior_count = int((data or {}).get("step_start_index") or 0)
    prior_steps = all_steps[:prior_count]
    prior_block = (
        "\n".join(f"- {s}" for s in prior_steps)
        if prior_steps
        else "- (this is the first build phase)"
    )

    manifest = build_label_manifest(materials, phase_steps, all_steps)
    manifest_block = _format_manifest_block(manifest, phase_steps)

    simplify_note = ""
    if len(manifest) > 4:
        simplify_note = """
SIMPLIFIED LAYOUT (many materials — keep mild 3D isometric vibe):
- Show 4–6 key floating parts maximum, spaced clearly
- ONE label per material type (do not label every duplicate stick or strip)
- Mild 3D / isometric perspective is fine — prioritize readable correct labels over detail
- Omit tiny duplicate pieces if the diagram gets crowded
"""

    return f"""{CONCEPT_RENDER_STYLE}

PROJECT (must match exactly — never invent a different project):
- Title: {title or "DIY engineering build"}
- Description: {description or "Follow the build instructions."}
- Materials ONLY (draw ONLY these — no substitutions, no extra parts): {materials_line}

{manifest_block}
{simplify_note}
BUILD PHASE {phase_index + 1} of {total_phases}: {phase_title}
Phase focus: {phase_name}

STEPS IN THIS PHASE (assembly reference — labels and sizes must match these instructions):
{phase_steps_block}

ALREADY ASSEMBLED FROM PRIOR PHASES (show as connected base if relevant):
{prior_block}

PHASE RENDER RULES:
- Mild 3D isometric / exploded view — clean engineering diagram, not photorealistic
- Every callout label must match the LABEL MANIFEST — shape determines which label applies
- TAPE: only on a small strip; never on body/board/wing/stick
- TOOTHPICK: only on rod/stick shapes; never on flat sheets
- PAPER/CARDBOARD: on flat sheets and structural boards including wings and body
- Show dimension text ONLY when the manifest lists a size for that part
- If crowded, simplify — fewer parts, correct labels beat extra detail
- Heading text: "{phase_title}"
"""
