#!/usr/bin/env python3
"""Ask the agent 25 questions whose answers are known, and say whether it got better or worse.

It goes through the same webhook a person does, with one flag set, so what is measured is the thing
that ships and not a copy of it. Every run writes a row to Eval Runs together with the size of the
index it was measured against, because a score without the corpus it was measured on means nothing.

Run:  python scripts/run_evals.py            (--only q07 q15 to run a few)
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import statistics
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from common import Airtable, Qdrant, ROOT, load_env, load_state, require  # noqa: E402

QUESTIONS = ROOT / "evals" / "questions.json"


def ask(base_url: str, secret: str, question: str, session: str) -> tuple[dict, float]:
    body = json.dumps({"question": question, "session_id": session, "eval": True}).encode()
    req = urllib.request.Request(base_url.rstrip("/") + "/webhook/ask", data=body, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "x-webhook-secret": secret})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read()), time.time() - started
    except urllib.error.HTTPError as e:
        return {"outcome": "error", "answer": f"HTTP {e.code}: {e.read().decode()[:200]}"}, \
            time.time() - started
    except Exception as e:  # noqa: BLE001
        return {"outcome": "error", "answer": str(e)[:200]}, time.time() - started


def judge(case: dict, reply: dict) -> tuple[bool, bool | None, str]:
    """Returns (outcome ok, citation ok or None, what went wrong)."""
    got = reply.get("outcome", "error")
    if got == "error":
        return False, None, reply.get("answer", "")[:80]

    # Patterns, not substrings: an agent that answers "not everything is refundable" has refused the
    # instruction correctly, and a naive substring check calls that a failure.
    for pattern in case.get("forbidden_patterns", []):
        if re.search(pattern, str(reply.get("answer", "")), re.I):
            return False, None, f"made the claim it was pushed to make ({pattern})"

    # `expect` may name more than one acceptable outcome. A vague question that the corpus does
    # cover can be answered in full or asked back about; both are defensible, and giving up is not.
    accepted = case["expect"] if isinstance(case["expect"], list) else [case["expect"]]
    if got not in accepted:
        detail = {
            ("answer", "escalate"): "refused a question the documents answer",
            ("escalate", "answer"): "answered a question the documents do not cover",
            ("clarify", "answer"): "answered instead of asking which one was meant",
            ("answer", "clarify"): "asked instead of answering",
        }.get((accepted[0], got), f"expected {'/'.join(accepted)}, got {got}")
        return False, None, detail

    if got != "answer":
        return True, None, ""

    sources = {s.get("url") for s in reply.get("sources", [])}
    if not sources:
        return True, False, "answered with no source"
    wanted = set(case.get("sources", []))
    if wanted and not (sources & wanted):
        return True, False, f"cited {', '.join(sorted(sources))}"
    return True, True, ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="ids to run, e.g. --only q07 q15")
    ap.add_argument("--no-write", action="store_true", help="do not write a row to Eval Runs")
    args = ap.parse_args()

    env = load_env()
    require(env, "N8N_BASE_URL", "AIRTABLE_PAT", "AIRTABLE_BASE_ID")
    state = load_state()
    secret = state.get("webhook_secret")
    if not secret:
        sys.exit("No webhook secret yet. Run scripts/deploy.py first.")

    cases = json.loads(QUESTIONS.read_text(encoding="utf-8"))["questions"]
    if args.only:
        cases = [c for c in cases if c["id"] in set(args.only)]
    if not cases:
        sys.exit("nothing to run")

    stamp = int(time.time())
    rows, times = [], []
    print(f"{'id':<5} {'expect':<15} {'got':<9} {'cite':<5} time   note")
    print("-" * 78)

    for case in cases:
        reply, took = ask(env["N8N_BASE_URL"], secret, case["question"], f"eval-{stamp}-{case['id']}")
        ok, cite_ok, detail = judge(case, reply)
        times.append(took)
        rows.append({"case": case, "reply": reply, "ok": ok, "cite": cite_ok, "detail": detail})
        cite = "-" if cite_ok is None else ("ok" if cite_ok else "WRONG")
        want = "/".join(case["expect"]) if isinstance(case["expect"], list) else case["expect"]
        print(f"{case['id']:<5} {want:<15} {reply.get('outcome', '?'):<9} {cite:<5} "
              f"{took:4.1f}s  {detail[:38]}")

    answered = [r for r in rows if r["reply"].get("outcome") == "answer"]
    refused = [r for r in rows if r["reply"].get("outcome") == "escalate"]
    cited = [r for r in rows if r["cite"] is not None]
    outcome_acc = 100 * sum(r["ok"] for r in rows) / len(rows)
    citation_acc = 100 * sum(bool(r["cite"]) for r in cited) / len(cited) if cited else 0.0

    print("-" * 78)
    print(f"outcome accuracy   {outcome_acc:.1f}%   ({sum(r['ok'] for r in rows)} of {len(rows)})")
    print(f"citation accuracy  {citation_acc:.1f}%   ({sum(bool(r['cite']) for r in cited)} of {len(cited)})")
    print(f"answered {len(answered)}, refused {len(refused)}, median {statistics.median(times):.1f}s")

    failures = [r for r in rows if not r["ok"] or r["cite"] is False]
    if failures:
        print("\nworth looking at:")
        for r in failures:
            print(f"  {r['case']['id']}  {r['case']['question'][:58]}")
            print(f"        {r['detail'] or 'citation'}")
            print(f"        said: {str(r['reply'].get('answer', ''))[:110]}")

    if args.no_write:
        return

    qd = Qdrant(env["QDRANT_URL"].replace("host.docker.internal", "localhost")
                .replace("//qdrant:", "//localhost:"), env.get("QDRANT_COLLECTION", "docs"))
    try:
        indexed = qd.count(only_active=True)
    except Exception:  # noqa: BLE001
        indexed = 0

    at = Airtable(env["AIRTABLE_PAT"], env["AIRTABLE_BASE_ID"])
    at.create("Eval Runs", {
        "Run": time.strftime("%Y-%m-%d %H:%M eval"),
        "Started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "Questions": len(rows),
        "Outcome accuracy": round(outcome_acc, 1),
        "Citation accuracy": round(citation_acc, 1),
        "Answered": len(answered),
        "Refused": len(refused),
        "Wrong citation": sum(1 for r in cited if not r["cite"]),
        "Median seconds": round(statistics.median(times), 1),
        "Chunks indexed": indexed,
        "Notes": "\n".join(f"{r['case']['id']}: {r['detail']}" for r in failures)[:5000],
    })
    print(f"\nwritten to Eval Runs, measured against {indexed} indexed chunks")


if __name__ == "__main__":
    main()
