"""
Self-Coding Loop — autonomous write → test → fix cycle.

Given a task description, the loop:
  1. Calls CodingBrain to generate implementation + pytest tests
  2. Writes code to the sandbox container
  3. Installs dependencies and runs pytest
  4. If tests pass  → returns success
  5. If tests fail  → feeds error context back to CodingBrain for a fix
  6. Repeats up to max_iterations (default 5)

All subprocess calls run in a thread pool to avoid blocking the event loop.
"""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Literal

log = logging.getLogger(__name__)

SANDBOX       = "aios_sandbox"
DEFAULT_ITERS = 5
EXEC_TIMEOUT  = 90   # seconds per test run


# ─────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────

@dataclass
class IterationResult:
    iteration: int
    code:         str
    tests:        str
    test_output:  str
    passed:       bool
    error_summary: str = ""


@dataclass
class SelfCodingResult:
    run_id:        str
    task:          str
    language:      str
    status:        Literal["running", "passed", "failed", "max_iterations"]
    iterations:    int
    final_code:    str
    final_tests:   str
    last_output:   str
    started_at:    str
    finished_at:   str = ""
    history:       list[IterationResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "run_id":       self.run_id,
            "task":         self.task,
            "language":     self.language,
            "status":       self.status,
            "iterations":   self.iterations,
            "final_code":   self.final_code[:4000],
            "final_tests":  self.final_tests[:2000],
            "last_output":  self.last_output[:3000],
            "started_at":   self.started_at,
            "finished_at":  self.finished_at,
            "history": [
                {
                    "iteration":     h.iteration,
                    "passed":        h.passed,
                    "error_summary": h.error_summary[:500],
                }
                for h in self.history
            ],
        }


# ─────────────────────────────────────────
# In-memory run registry (single-instance)
# ─────────────────────────────────────────

_runs: dict[str, SelfCodingResult] = {}


def get_run(run_id: str) -> SelfCodingResult | None:
    return _runs.get(run_id)


def list_runs(limit: int = 20) -> list[dict]:
    runs = sorted(_runs.values(), key=lambda r: r.started_at, reverse=True)
    return [r.to_dict() for r in runs[:limit]]


# ─────────────────────────────────────────
# SelfCodingLoop
# ─────────────────────────────────────────

class SelfCodingLoop:
    """Orchestrates the autonomous write → test → fix loop."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def start(
        self,
        task: str,
        language: str = "python",
        max_iterations: int = DEFAULT_ITERS,
    ) -> str:
        """Start the loop as a background task. Returns run_id."""
        run_id = str(uuid.uuid4())[:8]
        result = SelfCodingResult(
            run_id=run_id,
            task=task,
            language=language,
            status="running",
            iterations=0,
            final_code="",
            final_tests="",
            last_output="",
            started_at=datetime.now(UTC).isoformat(),
        )
        _runs[run_id] = result

        asyncio.create_task(
            self._run(result, max_iterations),
            name=f"self_coding_{run_id}",
        )
        return run_id

    async def _run(self, result: SelfCodingResult, max_iterations: int) -> None:
        task     = result.task
        language = result.language
        history: list[IterationResult] = []
        error_ctx = ""
        code      = ""
        tests     = ""

        try:
            for iteration in range(1, max_iterations + 1):
                log.info("SelfCodingLoop[%s]: iteration %d/%d", result.run_id, iteration, max_iterations)
                result.iterations = iteration

                # 1. Generate code + tests via CodingBrain
                code, tests = await self._generate(task, language, error_ctx, iteration)

                # 2. Write to sandbox
                await asyncio.to_thread(self._write_to_sandbox, code, tests, language)

                # 3. Run tests
                test_output, passed = await asyncio.to_thread(self._run_tests, language)

                # 4. Summarize errors if failed
                error_summary = self._extract_errors(test_output) if not passed else ""
                error_ctx     = error_summary

                iter_result = IterationResult(
                    iteration=iteration,
                    code=code,
                    tests=tests,
                    test_output=test_output,
                    passed=passed,
                    error_summary=error_summary,
                )
                history.append(iter_result)

                result.final_code   = code
                result.final_tests  = tests
                result.last_output  = test_output
                result.history      = history

                log.info(
                    "SelfCodingLoop[%s]: iter %d passed=%s",
                    result.run_id, iteration, passed,
                )

                if passed:
                    result.status = "passed"
                    break
            else:
                result.status = "max_iterations"

        except Exception as exc:
            log.error("SelfCodingLoop[%s] error: %s", result.run_id, exc, exc_info=True)
            result.status      = "failed"
            result.last_output = str(exc)

        result.finished_at = datetime.now(UTC).isoformat()
        log.info(
            "SelfCodingLoop[%s]: done status=%s iterations=%d",
            result.run_id, result.status, result.iterations,
        )

    # ── Code generation ────────────────────────────────────────────────────────

    async def _generate(
        self, task: str, language: str, error_ctx: str, iteration: int
    ) -> tuple[str, str]:
        from ..agents.coding_brain.brain import CodingBrain

        brain = CodingBrain(api_key=self.api_key)

        if iteration == 1:
            prompt = (
                f"Task: {task}\n"
                f"Language: {language}\n\n"
                "Generate complete working code AND pytest tests.\n"
                "Format your response EXACTLY like this:\n\n"
                "===IMPLEMENTATION===\n"
                "<your implementation code here>\n\n"
                "===TESTS===\n"
                "<your pytest tests here>"
            )
        else:
            prompt = (
                f"Task: {task}\n"
                f"Language: {language}\n"
                f"This is fix attempt #{iteration}.\n\n"
                f"The previous tests FAILED with these errors:\n{error_ctx}\n\n"
                "Fix the implementation. Only change tests if they are wrong.\n"
                "Format EXACTLY:\n\n"
                "===IMPLEMENTATION===\n"
                "<fixed implementation>\n\n"
                "===TESTS===\n"
                "<tests (unchanged unless they had bugs)>"
            )

        result = await brain.run(
            messages=[{"role": "user", "content": prompt}],
            task_type="default",
        )
        content = result.get("content", "")

        code  = self._extract_section(content, "IMPLEMENTATION")
        tests = self._extract_section(content, "TESTS")

        # Fallback: if no markers found, treat whole response as code
        if not code and not tests:
            code = content

        return code, tests

    # ── Sandbox execution (sync, run in thread) ───────────────────────────────

    def _write_to_sandbox(self, code: str, tests: str, language: str) -> None:
        ext = {"python": "py", "javascript": "js", "typescript": "ts"}.get(language, language)
        self._exec(f"mkdir -p /workspace/coding_loop", timeout=5)
        self._write("/workspace/coding_loop/solution.py" if language == "python" else
                    f"/workspace/coding_loop/solution.{ext}", code)
        test_fname = "test_solution.py" if language == "python" else f"test_solution.{ext}"
        self._write(f"/workspace/coding_loop/{test_fname}", tests)

    def _run_tests(self, language: str) -> tuple[str, bool]:
        if language == "python":
            cmd = (
                "cd /workspace/coding_loop && "
                "pip install pytest -q 2>/dev/null; "
                "python -m pytest test_solution.py -v --tb=short --no-header 2>&1"
            )
        elif language in ("javascript", "typescript"):
            cmd = "cd /workspace/coding_loop && node test_solution.js 2>&1"
        else:
            return f"Unsupported language: {language}", False

        output = self._exec(cmd, timeout=EXEC_TIMEOUT)

        # Determine pass/fail
        passed = (
            "passed" in output.lower()
            and "failed" not in output.lower()
            and "error" not in output.lower()
        )
        # Edge case: "1 passed" with "0 failed" is fine
        if re.search(r"\d+ passed", output, re.IGNORECASE):
            if not re.search(r"\d+ (failed|error)", output, re.IGNORECASE):
                passed = True

        return output, passed

    def _exec(self, cmd: str, timeout: int = 30) -> str:
        try:
            result = subprocess.run(
                ["docker", "exec", SANDBOX, "sh", "-c", cmd],
                capture_output=True, text=True, timeout=timeout,
            )
            out = (result.stdout + result.stderr).strip()
            return out[:5000] if len(out) > 5000 else out
        except subprocess.TimeoutExpired:
            return f"[TIMEOUT after {timeout}s]"
        except FileNotFoundError:
            return "[Docker not available — is aios_sandbox running?]"
        except Exception as exc:
            return f"[Error: {exc}]"

    def _write(self, path: str, content: str) -> None:
        try:
            subprocess.run(
                ["docker", "exec", "-i", SANDBOX, "tee", path],
                input=content, capture_output=True, text=True, timeout=10,
            )
        except Exception as exc:
            log.warning("sandbox write to %s failed: %s", path, exc)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_section(text: str, section: str) -> str:
        pattern = rf"==={re.escape(section)}===\s*(.*?)(?:===\w+===|$)"
        match   = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        return match.group(1).strip() if match else ""

    @staticmethod
    def _extract_errors(output: str) -> str:
        lines = output.split("\n")
        keywords = ("error", "failed", "assert", "exception", "traceback", "e   ")
        error_lines = [l for l in lines if any(k in l.lower() for k in keywords)]
        return "\n".join(error_lines[:40])
