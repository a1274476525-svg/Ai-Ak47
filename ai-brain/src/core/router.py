from typing import Literal

TaskType = Literal[
    "coding", "research", "math", "creative", "general",
    "security", "testing", "coding_brain",
]

# Which provider handles which task type (first preference)
TASK_PROVIDER_MAP: dict[str, str] = {
    "coding":        "claude",
    "coding_brain":  "claude",
    "security":      "claude",
    "testing":       "claude",
    "research":      "gemini",
    "math":          "deepseek",
    "creative":      "gpt",
    "general":       "claude",
}

# Fallback chain in order
FALLBACK_CHAIN = ["claude", "gpt", "gemini", "deepseek", "mistral"]

# Simple keyword scoring for auto-detection
_KEYWORDS: dict[str, list[str]] = {
    "coding": [
        "code", "function", "class", "bug", "debug", "implement", "write a",
        "build", "program", "api", "script", "refactor", "algorithm", "fix",
        "error", "syntax", "compile", "import", "module", "library",
    ],
    "security": [
        "security", "vulnerability", "exploit", "injection", "xss", "csrf",
        "authentication", "authorization", "pentest", "attack", "threat",
    ],
    "testing": [
        "test", "unittest", "pytest", "coverage", "mock", "spec", "assert",
        "integration test", "e2e", "snapshot",
    ],
    "research": [
        "research", "find", "search", "what is", "explain", "how does",
        "analyze", "compare", "difference between", "overview", "summary",
    ],
    "math": [
        "math", "calculate", "equation", "solve", "formula", "derivative",
        "integral", "probability", "statistics", "matrix", "linear algebra",
    ],
    "creative": [
        "write a story", "blog post", "article", "poem", "creative", "content",
        "marketing", "copywriting", "description", "caption",
    ],
}


def detect_task_type(message: str) -> TaskType:
    lower = message.lower()
    scores: dict[str, int] = {t: 0 for t in _KEYWORDS}

    for task, keywords in _KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                scores[task] += 1

    best = max(scores, key=lambda t: scores[t])
    return best if scores[best] > 0 else "general"  # type: ignore[return-value]
