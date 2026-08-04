"""
Pure-Python validation for AI-generated Enginuity projects.
No LLM calls — intended to complete in well under one second.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

from validators.field_alignment import check_field_alignment

logger = logging.getLogger(__name__)

PASS_THRESHOLD = int(os.getenv("VALIDATION_PASS_THRESHOLD", "85"))

# Core modes (Apprentice / Associate / Innovator)
DIFFICULTY_CORE = frozenset({"apprentice", "associate", "innovator"})
# Innovator Lite uses Beginner / Intermediate labels
DIFFICULTY_LITE = frozenset({"beginner", "intermediate", "beginner+", "advanced"})

_CHECK_LABELS = {
    "required_fields": "Required Fields",
    "materials": "Materials",
    "steps": "Steps",
    "component_usage": "Component Usage",
    "time_estimate": "Time Estimate",
    "duplicates": "Duplicates",
    "safety": "Safety",
    "difficulty": "Difficulty",
    "concept_render": "Concept Render",
    "field_alignment": "Field Alignment",
}

_WEIGHTS = {
    "required_fields": 23,
    "materials": 14,
    "steps": 14,
    "component_usage": 14,
    "time_estimate": 10,
    "duplicates": 5,
    "safety": 10,
    "difficulty": 5,
    "concept_render": 5,
    "field_alignment": 5,
}


@dataclass
class ValidationResult:
    score: int
    passed: bool
    checks: dict[str, str] = field(default_factory=dict)
    issues: list[str] = field(default_factory=list)
    check_scores: dict[str, float] = field(default_factory=dict)

    @property
    def report(self) -> str:
        return format_validation_report(self)


def format_validation_report(result: ValidationResult) -> str:
    lines = ["Project Validation", ""]
    for key, label in _CHECK_LABELS.items():
        status = result.checks.get(key, "⏭️")
        lines.append(f"{label:<22} {status}")
    lines.append("")
    lines.append(f"Overall Score: {result.score}/100")
    if result.issues:
        lines.append("")
        lines.append("Issues:")
        for issue in result.issues[:20]:
            lines.append(f"  - {issue}")
        if len(result.issues) > 20:
            lines.append(f"  … and {len(result.issues) - 20} more")
    return "\n".join(lines)


def _status_icon(ratio: float, *, required: bool = False) -> str:
    if ratio >= 1.0:
        return "✅"
    if ratio >= 0.5:
        return "⚠️"
    return "❌" if required else "⚠️"


def _first_nonempty(project: Mapping[str, Any], keys: Sequence[str]) -> str:
    for key in keys:
        value = project.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def _normalize_key(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _material_core_name(material: str) -> str:
    """Strip quantity prefixes like '2x', '3 ×', leading numbers."""
    text = material.strip()
    text = re.sub(r"^[\d]+\s*[x×]\s*", "", text, flags=re.I)
    text = re.sub(r"^\d+\s+", "", text)
    return text.strip().lower()


def _extract_step_number(step: str, index: int) -> int | None:
    match = re.match(r"^\s*(?:step\s*)?(\d+)[\.\)\:\-]", step, re.I)
    if match:
        return int(match.group(1))
    match = re.match(r"^\s*(\d+)\s*[\.\)]", step)
    if match:
        return int(match.group(1))
    return None


def _parse_minutes(time_text: str) -> int | None:
    if not time_text:
        return None
    text = time_text.lower().strip()
    range_days = re.search(r"(\d+)\s*[-–]\s*(\d+)\s*days?", text)
    if range_days:
        return int((int(range_days.group(1)) + int(range_days.group(2))) / 2 * 24 * 60)
    single_day = re.search(r"(\d+(?:\.\d+)?)\s*days?", text)
    if single_day:
        return int(float(single_day.group(1)) * 24 * 60)
    hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)", text)
    min_match = re.search(r"(\d+)\s*(?:minutes?|mins?|m\b)", text)
    total = 0
    if hour_match:
        total += int(float(hour_match.group(1)) * 60)
    if min_match:
        total += int(min_match.group(1))
    if total:
        return total
    range_match = re.search(r"(\d+)\s*[-–]\s*(\d+)", text)
    if range_match:
        lo, hi = int(range_match.group(1)), int(range_match.group(2))
        if "hour" in text or "hr" in text:
            return int((lo + hi) / 2 * 60)
        return int((lo + hi) / 2)
    single = re.search(r"(\d+)", text)
    if single:
        n = int(single.group(1))
        if "hour" in text or "hr" in text:
            return n * 60
        return n
    return None


def _expected_time_range(step_count: int) -> tuple[int, int] | None:
    if 5 <= step_count <= 10:
        return 15, 45
    if 10 < step_count <= 20:
        return 30, 90
    if 20 < step_count <= 40:
        return 60, 180
    return None


def _collect_learning_text(project: Mapping[str, Any]) -> str:
    parts = [
        _first_nonempty(project, ("learning_objectives",)),
        _first_nonempty(project, ("engineering_explanation", "engineeringExplanation")),
        _first_nonempty(project, ("physics_explanation", "physicsExplanation")),
        _first_nonempty(project, ("science_explanation", "scienceExplanation")),
    ]
    objectives = project.get("learning_objectives")
    if isinstance(objectives, list):
        parts.extend(str(o).strip() for o in objectives if str(o).strip())
    return "\n".join(p for p in parts if p)


def _collect_safety_notes(
    project: Mapping[str, Any],
    payload_safety: Sequence[str] | None = None,
) -> list[str]:
    notes: list[str] = []
    for key in ("safety_notes", "safety_warnings", "safetyNotes"):
        notes.extend(_string_list(project.get(key)))
    if payload_safety:
        notes.extend(_string_list(payload_safety))
    return notes


def _concept_render_components(project: Mapping[str, Any]) -> list[str]:
    components: list[str] = []
    cr = project.get("concept_render") or project.get("conceptRender")
    if isinstance(cr, dict):
        components.extend(_string_list(cr.get("components")))
        for phase in cr.get("phases") or cr.get("build_phases") or []:
            if isinstance(phase, dict):
                components.extend(_string_list(phase.get("components")))
    components.extend(_string_list(project.get("concept_render_components")))
    for phase in project.get("build_phases") or project.get("buildPhases") or []:
        if isinstance(phase, dict):
            components.extend(_string_list(phase.get("components")))
    return components


def _find_duplicates(items: Sequence[str]) -> list[str]:
    seen: dict[str, str] = {}
    dups: list[str] = []
    for item in items:
        key = _normalize_key(item)
        if not key:
            continue
        if key in seen:
            dups.append(item)
        else:
            seen[key] = item
    return dups


def _split_paragraphs(text: str) -> list[str]:
    if not text:
        return []
    chunks = re.split(r"\n\s*\n", text)
    return [c.strip() for c in chunks if c.strip()]


def _material_referenced(material: str, steps_text: str) -> bool:
    core = _material_core_name(material)
    if not core or len(core) < 2:
        return False
    hay = steps_text.lower()
    if core in hay:
        return True
    # Match significant tokens (e.g. "balloon" from "1 red balloon")
    tokens = [t for t in re.split(r"[\s,;/]+", core) if len(t) >= 3]
    if not tokens:
        return False
    return any(token in hay for token in tokens)


def _time_from_difficulty_label(label: str) -> str:
    """Extract a range like '8–20 min' from 'Easy: 8–20 min'."""
    if not label:
        return ""
    match = re.search(r"(\d+\s*[-–]\s*\d+\s*(?:min|minutes|hours?|hrs?|days?)[^\,]*)", label, re.I)
    if match:
        return match.group(1).strip()
    return ""


def _min_steps_for_difficulty(difficulty_hint: str, mode: str = "") -> int | None:
    d = (difficulty_hint or "").strip().lower()
    if "15-20" in d or "15–20" in d:
        return None
    m = (mode or "").strip().lower()
    if "day" in d:
        if "innovator" in m:
            return 18
        return 20
    if "hard" in d:
        if any(x in d for x in ("150", "120", "180", "hour", "hr")):
            return 15
        return 12
    if "medium" in d:
        return 10
    return None


def _min_phases_for_difficulty(difficulty_hint: str, mode: str = "") -> int | None:
    d = (difficulty_hint or "").strip().lower()
    if "15-20" in d or "15–20" in d:
        return None
    m = (mode or "").strip().lower()
    if "day" in d:
        return 3 if "innovator" in m else 3
    if "hard" in d and any(x in d for x in ("150", "120", "180", "hour", "hr", "day")):
        return 2
    return None


def normalize_project_view(
    project: Mapping[str, Any],
    *,
    mode: str = "",
    difficulty_hint: str = "",
    payload_safety: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Flatten aliases into a consistent view for validation."""
    title = _first_nonempty(project, ("title", "project_name", "name"))
    description = _first_nonempty(project, ("description",))
    difficulty = _first_nonempty(project, ("difficulty",)) or mode or difficulty_hint
    estimated_time = _first_nonempty(
        project, ("estimated_time", "estimated_build_time", "estimatedTime")
    )
    if not estimated_time and difficulty_hint:
        estimated_time = _time_from_difficulty_label(difficulty_hint)
    materials = _string_list(project.get("materials") or project.get("materials_needed"))
    steps = _string_list(project.get("steps"))
    learning = _collect_learning_text(project)
    safety = _collect_safety_notes(project, payload_safety)
    concept_components = _concept_render_components(project)
    has_concept_render = bool(concept_components) or bool(
        project.get("concept_render") or project.get("build_phases")
    )
    return {
        "title": title,
        "description": description,
        "difficulty": difficulty,
        "estimated_time": estimated_time,
        "materials": materials,
        "steps": steps,
        "learning_text": learning,
        "safety_notes": safety,
        "concept_components": concept_components,
        "has_concept_render": has_concept_render,
        "mode": mode,
    }


def validate_project(
    project: Mapping[str, Any],
    *,
    mode: str = "",
    difficulty_hint: str = "",
    payload_safety: Sequence[str] | None = None,
    concept_render_enabled: bool = False,
    lite_mode: bool = False,
    engineering_field: str = "",
) -> ValidationResult:
    view = normalize_project_view(
        project,
        mode=mode,
        difficulty_hint=difficulty_hint,
        payload_safety=payload_safety,
    )
    issues: list[str] = []
    check_scores: dict[str, float] = {}

    # --- Required fields ---
    required_checks = {
        "title": view["title"],
        "description": view["description"],
        "materials": view["materials"],
        "steps": view["steps"],
        "learning objectives": view["learning_text"],
    }
    if lite_mode:
        required_checks["estimated build time"] = view["estimated_time"]
        required_checks["difficulty"] = view["difficulty"]
    missing = [name for name, val in required_checks.items() if not val]
    if concept_render_enabled and view["has_concept_render"] and not view["concept_components"]:
        missing.append("concept render components")
    req_ratio = 1.0 - (len(missing) / max(len(required_checks) + (1 if concept_render_enabled else 0), 1))
    req_ratio = max(0.0, min(1.0, req_ratio))
    if missing:
        issues.extend(f"Missing required field: {m}" for m in missing)
    check_scores["required_fields"] = req_ratio

    # --- Materials ---
    mat_ratio = 1.0
    materials = view["materials"]
    if not materials:
        mat_ratio = 0.0
        issues.append("Materials list is empty.")
    else:
        empty_mats = [m for m in materials if not _material_core_name(m)]
        dup_mats = _find_duplicates(materials)
        penalties = 0
        if empty_mats:
            penalties += 1
            issues.append("One or more materials have no name.")
        if dup_mats:
            penalties += 1
            issues.append(f"Duplicate materials: {', '.join(dup_mats[:3])}")
        mat_ratio = max(0.0, 1.0 - penalties * 0.35)
    check_scores["materials"] = mat_ratio

    # --- Steps ---
    step_ratio = 1.0
    steps = view["steps"]
    if not steps:
        step_ratio = 0.0
        issues.append("No build steps provided.")
    else:
        empty_steps = [s for s in steps if not s.strip()]
        dup_steps = _find_duplicates(steps)
        penalties = 0
        if empty_steps:
            penalties += 1
            issues.append("One or more steps are empty.")
        if dup_steps:
            penalties += 1
            issues.append("Duplicate build steps detected.")
        expected_numbers = list(range(1, len(steps) + 1))
        actual_numbers = []
        for i, step in enumerate(steps):
            num = _extract_step_number(step, i)
            if num is not None:
                actual_numbers.append(num)
        if actual_numbers and actual_numbers != expected_numbers[: len(actual_numbers)]:
            penalties += 0.5
            issues.append("Step numbering may be incorrect.")
        min_steps = _min_steps_for_difficulty(difficulty_hint, mode)
        if min_steps and len(steps) < min_steps:
            penalties += 1.5
            issues.append(
                f"Only {len(steps)} steps for a {difficulty_hint or 'long'} build; "
                f"expected at least {min_steps} detailed steps."
            )
        min_phases = _min_phases_for_difficulty(difficulty_hint, mode)
        build_phases = project.get("build_phases") or project.get("buildPhases")
        phase_count = len(build_phases) if isinstance(build_phases, list) else 0
        if min_phases and phase_count < min_phases:
            penalties += 1.0
            issues.append(
                f"Multi-part build expected ({min_phases}+ build_phases) but got {phase_count}."
            )
        step_ratio = max(0.0, 1.0 - penalties * 0.2)
    check_scores["steps"] = step_ratio

    # --- Component usage ---
    comp_ratio = 1.0
    if materials and steps:
        steps_blob = " ".join(steps).lower()
        unused = [m for m in materials if not _material_referenced(m, steps_blob)]
        if unused:
            comp_ratio = max(0.0, 1.0 - len(unused) / len(materials))
            issues.append(
                f"Materials not referenced in steps: {', '.join(unused[:5])}"
            )
    elif materials:
        comp_ratio = 0.0
    check_scores["component_usage"] = comp_ratio

    # --- Time estimate ---
    time_ratio = 1.0
    step_count = len(steps)
    minutes = _parse_minutes(view["estimated_time"])
    expected = _expected_time_range(step_count)
    if minutes is not None and expected:
        lo, hi = expected
        if minutes < lo * 0.4 or minutes > hi * 2.5:
            time_ratio = 0.4
            issues.append(
                f"Estimated time ({view['estimated_time']}) seems unrealistic for {step_count} steps."
            )
        elif minutes < lo * 0.7 or minutes > hi * 1.5:
            time_ratio = 0.75
            issues.append(
                f"Estimated time ({view['estimated_time']}) is slightly off for {step_count} steps."
            )
    elif lite_mode and not view["estimated_time"]:
        time_ratio = 0.0
        issues.append("Missing estimated build time.")
    elif not view["estimated_time"] and expected:
        # Apprentice/Associate often omit explicit time — use neutral score
        time_ratio = 0.85
    check_scores["time_estimate"] = time_ratio

    # --- Duplicates (paragraphs / objectives) ---
    dup_ratio = 1.0
    dup_penalties = 0
    paragraphs = _split_paragraphs(view["description"])
    paragraphs.extend(_split_paragraphs(view["learning_text"]))
    para_dups = _find_duplicates(paragraphs)
    if para_dups:
        dup_penalties += 1
        issues.append("Repeated paragraphs in description or learning content.")
    objectives = _string_list(project.get("learning_objectives"))
    if objectives and _find_duplicates(objectives):
        dup_penalties += 1
        issues.append("Duplicate learning objectives.")
    dup_ratio = max(0.0, 1.0 - dup_penalties * 0.5)
    check_scores["duplicates"] = dup_ratio

    # --- Safety ---
    safety_ratio = 1.0 if view["safety_notes"] else 0.0
    if not view["safety_notes"]:
        issues.append("No safety notes provided.")
    check_scores["safety"] = safety_ratio

    # --- Difficulty ---
    diff_text = (view["difficulty"] or mode or difficulty_hint).strip().lower()
    diff_ratio = 1.0
    if lite_mode:
        valid = diff_text in DIFFICULTY_LITE or any(d in diff_text for d in DIFFICULTY_LITE)
    else:
        mode_lower = (mode or "").strip().lower()
        valid = (
            diff_text in DIFFICULTY_CORE
            or any(d in diff_text for d in DIFFICULTY_CORE)
            or (mode_lower in DIFFICULTY_CORE and not project.get("difficulty"))
        )
    if not diff_text:
        diff_ratio = 0.5 if not lite_mode else 0.0
        if lite_mode:
            issues.append("Missing difficulty level.")
    elif not valid:
        diff_ratio = 0.0
        issues.append(
            f"Invalid difficulty '{view['difficulty']}'. "
            f"Expected {'Beginner/Intermediate' if lite_mode else 'Apprentice/Associate/Innovator'}."
        )
    check_scores["difficulty"] = diff_ratio

    # --- Concept render ---
    cr_ratio = 1.0
    if concept_render_enabled and view["concept_components"]:
        mat_cores = {_material_core_name(m) for m in materials}
        unknown = []
        for comp in view["concept_components"]:
            core = _material_core_name(comp)
            if not core:
                continue
            if not any(core in m or m in core for m in mat_cores):
                unknown.append(comp)
        if unknown:
            cr_ratio = max(0.0, 1.0 - len(unknown) / len(view["concept_components"]))
            issues.append(
                f"Concept Render unknown components: {', '.join(unknown[:5])}"
            )
    check_scores["concept_render"] = cr_ratio

    # --- Engineering field alignment ---
    field_text = "\n".join(
        filter(
            None,
            [
                view["title"],
                view["description"],
                "\n".join(view["steps"]),
                view["learning_text"],
            ],
        )
    )
    field_ratio, field_issues = check_field_alignment(field_text, engineering_field)
    if field_issues:
        issues.extend(field_issues)
    check_scores["field_alignment"] = field_ratio if engineering_field.strip() else 1.0

    # --- Weighted score ---
    total_weight = sum(_WEIGHTS.values())
    weighted = sum(check_scores[k] * _WEIGHTS[k] for k in _WEIGHTS)
    score = int(round(weighted / total_weight * 100))
    score = max(0, min(100, score))
    passed = score >= PASS_THRESHOLD and req_ratio >= 0.85 and safety_ratio >= 1.0

    checks = {
        key: _status_icon(check_scores[key], required=(key in ("required_fields", "safety")))
        for key in _CHECK_LABELS
    }

    return ValidationResult(
        score=score,
        passed=passed,
        checks=checks,
        issues=issues,
        check_scores=check_scores,
    )


def _unwrap_projects(payload: Mapping[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """Return (project_list, payload_level_safety_warnings)."""
    safety: list[str] = []
    if not isinstance(payload, dict):
        return [], safety

    if payload.get("error"):
        return [], safety

    # Innovator Lite single-project shape
    if "title" in payload and "steps" in payload:
        return [dict(payload)], safety

    safety = _string_list(payload.get("safety_warnings"))

    projects = payload.get("projects")
    if isinstance(projects, list):
        return [p for p in projects if isinstance(p, dict)], safety

    if isinstance(projects, dict):
        safety = _string_list(projects.get("safety_warnings")) or safety
        inner = projects.get("projects")
        if isinstance(inner, list):
            return [p for p in inner if isinstance(p, dict)], safety

    return [], safety


def validate_payload(
    payload: Mapping[str, Any],
    *,
    mode: str = "",
    difficulty_hint: str = "",
    concept_render_enabled: bool = False,
    lite_mode: bool = False,
    engineering_field: str = "",
) -> ValidationResult:
    """
    Validate a full API payload. Multi-project payloads use the minimum project score.
    """
    if isinstance(payload, dict) and payload.get("error"):
        return ValidationResult(
            score=0,
            passed=False,
            issues=[str(payload.get("error"))],
        )

    project_list, payload_safety = _unwrap_projects(payload)
    if not project_list:
        return ValidationResult(
            score=0,
            passed=False,
            issues=["No projects found in payload."],
        )

    results = [
        validate_project(
            proj,
            mode=mode,
            difficulty_hint=difficulty_hint,
            payload_safety=payload_safety,
            concept_render_enabled=concept_render_enabled,
            lite_mode=lite_mode,
            engineering_field=engineering_field,
        )
        for proj in project_list
    ]

    if len(results) == 1:
        return results[0]

    min_score = min(r.score for r in results)
    merged_issues: list[str] = []
    merged_checks: dict[str, str] = {}
    merged_scores: dict[str, float] = {}
    for i, r in enumerate(results):
        merged_issues.extend(f"Project {i + 1}: {issue}" for issue in r.issues)
        for key, val in r.check_scores.items():
            merged_scores[key] = min(merged_scores.get(key, 1.0), val)
    for key in _CHECK_LABELS:
        merged_checks[key] = _status_icon(merged_scores.get(key, 0.0), required=(key in ("required_fields", "safety")))

    passed = min_score >= PASS_THRESHOLD and all(r.passed for r in results)

    return ValidationResult(
        score=min_score,
        passed=passed,
        checks=merged_checks,
        issues=merged_issues,
        check_scores=merged_scores,
    )


def log_validation_report(result: ValidationResult, *, label: str = "") -> None:
    prefix = f"[validation{' ' + label if label else ''}]"
    logger.info("%s\n%s", prefix, result.report)
