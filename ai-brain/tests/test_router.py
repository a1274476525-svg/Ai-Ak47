"""Tests for keyword-based task-type auto-detection (src/core/router.py)."""
from src.core.router import detect_task_type


def test_detects_coding():
    assert detect_task_type("Can you fix this bug in my function?") == "coding"


def test_detects_security():
    assert detect_task_type("Explain this XSS vulnerability and how to prevent it") == "security"


def test_detects_testing():
    assert detect_task_type("Write a pytest unittest for this module") == "testing"


def test_detects_research():
    assert detect_task_type("What is the difference between REST and GraphQL?") == "research"


def test_detects_math():
    assert detect_task_type("Solve this equation and calculate the derivative") == "math"


def test_detects_creative():
    # Avoid "write a" — it's also a coding keyword and would tie the score.
    assert detect_task_type("Create a marketing caption for this product") == "creative"


def test_falls_back_to_general_with_no_keywords():
    assert detect_task_type("hello there") == "general"


def test_empty_message_is_general():
    assert detect_task_type("") == "general"


def test_is_case_insensitive():
    assert detect_task_type("FIX THIS BUG IN MY CODE") == "coding"


def test_picks_highest_scoring_category_on_overlap():
    # Three coding keywords vs one research keyword — coding should win.
    msg = "debug this function and fix the syntax error, then explain how it works"
    assert detect_task_type(msg) == "coding"
