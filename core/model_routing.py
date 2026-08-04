"""Central model selection and token limits for Enginuity AI tasks."""

# Task-specific models (per product spec)
MODEL_SPARK_HELPER = "gpt-4o-mini"
MODEL_APPRENTICE = "gpt-4o-mini"
MODEL_ASSOCIATE = "gpt-4.1"
MODEL_INNOVATOR = "gpt-4o"
MODEL_SAFETY = "gpt-4o-mini"
MODEL_INNOVATOR_LITE = "gpt-4o-mini"

# Token ceilings (balance speed vs quality)
MAX_TOKENS_SPARK_HELPER = 520
MAX_TOKENS_PROJECT = 4200
MAX_TOKENS_PROJECT_APPRENTICE = 2800
MAX_TOKENS_PROJECT_ASSOCIATE = 4800
MAX_TOKENS_PROJECT_HARD = 5600
MAX_TOKENS_SAFETY = 220
MAX_TOKENS_INNOVATOR_LITE = 1000
MAX_TOKENS_INNOVATOR_BETA = 4800
MAX_TOKENS_INNOVATOR_CHAT = 800

MAX_HELPER_HISTORY = 10
MAX_HELPER_CONTEXT_CHARS = 3200


def normalize_mode(mode: str) -> str:
    return (mode or "").strip()


def model_for_mode(mode: str) -> str:
    """Map Enginuity mode name to the appropriate OpenAI model."""
    m = normalize_mode(mode).lower()
    if "innovator lite" in m or "innovator beta" in m:
        return MODEL_INNOVATOR_LITE
    if m == "innovator" or m.startswith("innovator "):
        return MODEL_INNOVATOR
    if "associate" in m:
        return MODEL_ASSOCIATE
    if "apprentice" in m:
        return MODEL_APPRENTICE
    return MODEL_APPRENTICE


def max_tokens_for_mode(mode: str) -> int:
    m = normalize_mode(mode).lower()
    if "innovator" in m and "lite" not in m:
        return MAX_TOKENS_PROJECT
    if "associate" in m:
        return MAX_TOKENS_PROJECT_ASSOCIATE
    if "apprentice" in m:
        return MAX_TOKENS_PROJECT_APPRENTICE
    return MAX_TOKENS_PROJECT_APPRENTICE


def max_tokens_for_difficulty(mode: str, difficulty: str) -> int:
    """Raise token ceiling for long / multi-day builds so step lists are not truncated."""
    base = max_tokens_for_mode(mode)
    m = normalize_mode(mode).lower()
    if "apprentice" in m:
        return base
    d = (difficulty or "").strip().lower()
    if "day" in d:
        return max(base, MAX_TOKENS_PROJECT_HARD)
    if "hard" in d:
        return max(base, MAX_TOKENS_PROJECT_ASSOCIATE)
    if "medium" in d and any(x in d for x in ("hour", "hr", "min")):
        return max(base, int(base * 1.15))
    return base


def max_tokens_for_innovator_beta(*, tutorial: bool = False, difficulty: str = "") -> int:
    if tutorial:
        return MAX_TOKENS_INNOVATOR_LITE
    d = (difficulty or "").strip().lower()
    if "day" in d or "hard" in d:
        return MAX_TOKENS_INNOVATOR_BETA
    return max(MAX_TOKENS_INNOVATOR_LITE, 3200)


def max_tokens_for_chat(mode: str) -> int:
    """Token ceiling for /chat-innovator (and similar conversational routes)."""
    m = normalize_mode(mode).lower()
    if "innovator lite" in m or ("innovator" in m and "lite" in m):
        return MAX_TOKENS_INNOVATOR_LITE
    if "innovator" in m:
        return MAX_TOKENS_INNOVATOR_CHAT
    if "associate" in m:
        return MAX_TOKENS_SPARK_HELPER
    return MAX_TOKENS_SPARK_HELPER


def should_run_post_safety(mode: str) -> bool:
    """Whether to run the post-generation safety pass.

    Skipped only for modes where the main project JSON already emphasizes safety
    (Apprentice, Innovator Lite). All other modes — including new/unlisted ones —
    run post-safety by default (fail-safe; matches legacy always-check behavior).
    """
    m = normalize_mode(mode).lower()
    if "apprentice" in m:
        return False
    if "lite" in m:
        return False
    return True
