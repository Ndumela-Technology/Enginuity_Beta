"""Unit tests for project_validator (no LLM, no network)."""

import sys
import unittest
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from validators.project_validator import (
    PASS_THRESHOLD,
    format_validation_report,
    validate_payload,
    validate_project,
)


def _good_lite_project(**overrides):
    base = {
        "title": "Balloon Rocket",
        "description": "Build a simple balloon-powered rocket using household materials.",
        "estimated_time": "15-20 minutes",
        "difficulty": "Beginner",
        "materials": ["balloon", "straw", "string", "tape"],
        "steps": [
            "1. Thread the string through the straw.",
            "2. Tape the inflated balloon to the straw.",
            "3. Release the balloon and observe motion.",
        ],
        "science_explanation": "Newton's third law: action and reaction.",
        "safety_notes": ["Adult supervision when using scissors."],
    }
    base.update(overrides)
    return base


def _good_batch_payload(**project_overrides):
    proj = {
        "project_name": "Paper Bridge",
        "description": "Design a bridge from paper that supports weight.",
        "materials_needed": ["paper", "tape", "coins"],
        "steps": [
            "1. Fold paper into triangular beams.",
            "2. Tape beams into a deck.",
            "3. Test with coins.",
        ],
        "engineering_explanation": "Triangular structures resist bending.",
        "physics_explanation": "Load spreads through compression members.",
    }
    proj.update(project_overrides)
    return {
        "projects": [proj, dict(proj, project_name="Tower"), dict(proj, project_name="Catapult")],
        "safety_warnings": ["Use scissors carefully."],
    }


class TestProjectValidator(unittest.TestCase):
    def test_good_lite_project_passes(self):
        result = validate_project(_good_lite_project(), lite_mode=True, mode="Innovator Lite")
        self.assertGreaterEqual(result.score, PASS_THRESHOLD)
        self.assertTrue(result.passed)

    def test_missing_safety_fails_pass_flag(self):
        result = validate_project(_good_lite_project(safety_notes=[]), lite_mode=True)
        self.assertFalse(result.passed)
        self.assertIn("No safety notes", result.issues[0])

    def test_duplicate_materials_lower_score(self):
        result = validate_project(
            _good_lite_project(materials=["balloon", "balloon", "tape"]),
            lite_mode=True,
        )
        self.assertTrue(any("Duplicate materials" in i for i in result.issues))

    def test_unused_material_flagged(self):
        result = validate_project(
            _good_lite_project(materials=["balloon", "toothpick"]),
            lite_mode=True,
        )
        self.assertTrue(any("not referenced" in i for i in result.issues))

    def test_invalid_difficulty(self):
        result = validate_project(
            _good_lite_project(difficulty="Expert"),
            lite_mode=True,
        )
        self.assertTrue(any("Invalid difficulty" in i for i in result.issues))

    def test_batch_payload_uses_min_score(self):
        payload = _good_batch_payload()
        payload["projects"][1]["materials_needed"] = []
        result = validate_payload(payload, mode="Associate", difficulty_hint="Associate")
        self.assertLess(result.score, 100)
        self.assertFalse(result.passed)

    def test_report_format(self):
        result = validate_project(_good_lite_project(), lite_mode=True)
        report = format_validation_report(result)
        self.assertIn("Project Validation", report)
        self.assertIn("Overall Score:", report)
        self.assertIn("Materials", report)

    def test_concept_render_unknown_component(self):
        result = validate_project(
            _good_lite_project(
                concept_render={"components": ["balloon", "motor"]},
            ),
            lite_mode=True,
            concept_render_enabled=True,
        )
        self.assertTrue(any("Concept Render unknown" in i for i in result.issues))


if __name__ == "__main__":
    unittest.main()
