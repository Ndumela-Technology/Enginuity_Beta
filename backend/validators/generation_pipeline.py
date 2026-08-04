"""
Post-generation validation with a single retry before returning the best result.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Mapping

from validators.project_validator import (
    PASS_THRESHOLD,
    ValidationResult,
    log_validation_report,
    validate_payload,
)

logger = logging.getLogger(__name__)


def _has_generation_error(payload: Any) -> bool:
    return isinstance(payload, dict) and bool(payload.get("error"))


def _merge_project_batches(
    attempt_a: Mapping[str, Any],
    attempt_b: Mapping[str, Any],
    score_a: int,
    score_b: int,
) -> Mapping[str, Any]:
    """
    For multi-project payloads, pick per-index project with the higher individual score.
    Falls back to the higher-scoring whole payload when shapes differ.
    """
    if score_b > score_a:
        return attempt_b
    if score_a > score_b:
        return attempt_a

    from validators.project_validator import _unwrap_projects, validate_project

    list_a, safety_a = _unwrap_projects(attempt_a)
    list_b, safety_b = _unwrap_projects(attempt_b)
    if not list_a or not list_b or len(list_a) != len(list_b):
        return attempt_b

    merged_projects = []
    for proj_a, proj_b in zip(list_a, list_b):
        res_a = validate_project(proj_a, payload_safety=safety_a)
        res_b = validate_project(proj_b, payload_safety=safety_b)
        merged_projects.append(proj_b if res_b.score >= res_a.score else proj_a)

    safety = safety_b if len(safety_b) >= len(safety_a) else safety_a
    if "title" in attempt_a and "steps" in attempt_a:
        return dict(merged_projects[0]) if merged_projects else attempt_b

    return {"projects": merged_projects, "safety_warnings": safety}


def run_validated_generation(
    generate_fn: Callable[[], Any],
    *,
    mode: str = "",
    difficulty_hint: str = "",
    concept_render_enabled: bool = False,
    lite_mode: bool = False,
    threshold: int | None = None,
    label: str = "",
    engineering_field: str = "",
) -> tuple[Any, ValidationResult | None]:
    """
    Generate → validate → optionally regenerate once → return best result.

    Returns (payload, final_validation_result).
    """
    cutoff = threshold if threshold is not None else PASS_THRESHOLD

    attempt1 = generate_fn()
    if _has_generation_error(attempt1):
        return attempt1, None

    result1 = validate_payload(
        attempt1,
        mode=mode,
        difficulty_hint=difficulty_hint,
        concept_render_enabled=concept_render_enabled,
        lite_mode=lite_mode,
        engineering_field=engineering_field,
    )
    log_validation_report(result1, label=f"{label} attempt=1")

    if result1.passed or result1.score >= cutoff:
        return attempt1, result1

    logger.info(
        "[validation%s] Score %s below threshold %s — regenerating once.",
        f" {label}" if label else "",
        result1.score,
        cutoff,
    )

    attempt2 = generate_fn()
    if _has_generation_error(attempt2):
        logger.warning(
            "[validation%s] Regeneration returned error; using first attempt.",
            f" {label}" if label else "",
        )
        return attempt1, result1

    result2 = validate_payload(
        attempt2,
        mode=mode,
        difficulty_hint=difficulty_hint,
        concept_render_enabled=concept_render_enabled,
        lite_mode=lite_mode,
        engineering_field=engineering_field,
    )
    log_validation_report(result2, label=f"{label} attempt=2")

    if result2.score >= result1.score:
        chosen = _merge_project_batches(attempt1, attempt2, result1.score, result2.score)
        final_result = result2
    else:
        chosen = attempt1
        final_result = result1

    if not final_result.passed:
        logger.warning(
            "[validation%s] Best score %s still below threshold %s — returning best attempt. Issues logged for review.",
            f" {label}" if label else "",
            final_result.score,
            cutoff,
        )

    return chosen, final_result
