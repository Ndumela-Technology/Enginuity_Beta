"""Tests for engineering field alignment heuristics."""

from validators.field_alignment import (
    check_field_alignment,
    extract_field_from_description,
    infer_engineering_field_from_text,
    normalize_engineering_field,
)


def test_normalize_aerospace_field():
    assert normalize_engineering_field("Aerospace Engineering ✈️") == "aerospace"


def test_aerospace_rejects_bridge_project():
    text = "Build a truss bridge from popsicle sticks to test load capacity."
    ratio, issues = check_field_alignment(text, "Aerospace Engineering")
    assert ratio == 0.0
    assert issues


def test_civil_accepts_bridge_project():
    text = "Build a small truss bridge from popsicle sticks to test load paths."
    ratio, issues = check_field_alignment(text, "Civil Engineering")
    assert ratio == 1.0
    assert not issues


def test_extract_field_from_description():
    desc = "3 projects. Focus: Mechanical Engineering. Apprentice mode."
    assert extract_field_from_description(desc) == "Mechanical Engineering"


def test_infer_aerospace_from_goal():
    assert infer_engineering_field_from_text("I want to do something with aerospace") == (
        "Aerospace Engineering"
    )


def test_aerospace_rejects_lava_lamp():
    text = "Build a homemade lava lamp using oil, water, and food coloring."
    ratio, issues = check_field_alignment(text, "Aerospace Engineering")
    assert ratio == 0.0
    assert issues
