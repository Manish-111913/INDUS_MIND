"""AI eval runner (docs/02 §15, §45 eval.yml, §54).

Runs the benchmark questions through the copilot against the seeded tenant and
prints the score table — the judging metrics (answer quality, time-to-answer).

Run: python -m evals.run_eval
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.core.logging import configure_logging, get_logger

log = get_logger("evals")


async def run(*, include_flagged: bool = False) -> None:
    from app.core.database import SessionFactory
    from app.modules.ai.evals import run_evals
    from app.modules.tenants.models import Tenant

    async with SessionFactory() as session:
        tenant = (await session.execute(
            select(Tenant).where(Tenant.slug == "indusmind"))).scalar_one_or_none()
        if tenant is None:
            print("No 'indusmind' tenant found — run `make seed` first.")
            return
        report = await run_evals(session, tenant.id, persist=True,
                                 include_flagged=include_flagged)
        await session.commit()

    s = report["summary"]
    print("\n" + "=" * 78)
    print("  IndusMind Copilot - Evaluation Report")
    print("=" * 78)
    print(f"  Questions: {s['questions']}   "
          f"Avg fact-coverage: {s['avg_fact_coverage']:.0%}   "
          f"Citation accuracy: {s['citation_accuracy']:.0%}")
    print(f"  Avg latency: {s['avg_latency_ms']:.0f} ms   "
          f"Avg confidence: {s['avg_confidence']:.2f}")
    print("-" * 78)
    print(f"  {'ID':4} {'Facts':6} {'Cite':5} {'ms':>6}  Question")
    print("-" * 78)
    for r in report["results"]:
        flag = "*" if r.get("flagged") else " "
        print(f"{flag} {r['id']:6} {r['fact_coverage']:>5.0%} "
              f"{'PASS' if r['citation_correct'] else '-':^5} {r['latency_ms']:>6}  "
              f"{r['question'][:42]}")
    print("=" * 78)
    if any(r.get("flagged") for r in report["results"]):
        print("  * = added from a 👎 down-voted answer (--include-flagged)")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the IndusMind copilot evals.")
    parser.add_argument("--include-flagged", action="store_true",
                        help="Add down-voted copilot questions as extra eval cases (docs/05 S4).")
    args = parser.parse_args()
    configure_logging("WARNING")
    asyncio.run(run(include_flagged=args.include_flagged))
