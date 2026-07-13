"""AI eval runner (docs/02 §15, §45 eval.yml, §54).

Loads benchmark_questions.yaml, runs each through /ai/query, scores
answer-contains-facts + citation-correctness + latency, prints a summary — the
judging metric. Full implementation lands with the ai module; scaffold ships the
runnable entrypoint.
"""

from __future__ import annotations

from pathlib import Path

from app.core.logging import configure_logging, get_logger

log = get_logger("evals")
QUESTIONS = Path(__file__).parent / "benchmark_questions.yaml"


def run() -> None:
    log.info("eval_run_start", file=str(QUESTIONS))
    log.info("eval_run_done", note="no questions yet — scaffold entrypoint")


if __name__ == "__main__":
    configure_logging("INFO")
    run()
