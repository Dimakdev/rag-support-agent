#!/usr/bin/env python3
"""Put the workflow into a running n8n.

It does four things, all of them idempotent:
  1. creates the credentials n8n needs, once, and remembers their ids in .deploy-state.json;
  2. creates the Qdrant collection if it is not there, with the dimension the embedding model returns;
  3. substitutes every __PLACEHOLDER__ in workflow.json with real ids;
  4. creates the workflow, or updates the one it created last time.

Run:  python scripts/deploy.py          (--dry prints the plan and changes nothing)
"""
from __future__ import annotations

import argparse
import json
import pathlib
import secrets
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from common import (Gemini, HttpError, N8n, Qdrant, ROOT, load_env, load_state,  # noqa: E402
                    qdrant_host_url, require, save_state)

CREDENTIALS = [
    # key in state, placeholder, n8n credential type, display name, builder(env) -> data or None
    ("airtable", "__AIRTABLE_CRED_ID__", "airtableTokenApi", "Airtable (rag agent)",
     lambda e: {"accessToken": e["AIRTABLE_PAT"]} if e.get("AIRTABLE_PAT") else None),
    ("gemini", "__GEMINI_CRED_ID__", "googlePalmApi", "Google Gemini (rag agent)",
     lambda e: {"apiKey": e["GEMINI_API_KEY"], "host": "https://generativelanguage.googleapis.com"}
     if e.get("GEMINI_API_KEY") else None),
    ("telegram", "__TELEGRAM_CRED_ID__", "telegramApi", "Telegram bot (rag agent)",
     lambda e: {"accessToken": e["TELEGRAM_BOT_TOKEN"], "baseUrl": "https://api.telegram.org"}
     if e.get("TELEGRAM_BOT_TOKEN") else None),
    ("webhook_auth", "__WEBHOOK_AUTH_CRED_ID__", "httpHeaderAuth", "Webhook secret (rag agent)",
     lambda e: {"name": "x-webhook-secret", "value": e["WEBHOOK_SECRET"]}),
]


def ensure_credentials(n8n: N8n, env: dict, state: dict, dry: bool) -> dict:
    out = {}
    creds = state.setdefault("credentials", {})
    for key, placeholder, cred_type, name, builder in CREDENTIALS:
        if creds.get(key):
            out[placeholder] = creds[key]
            print(f"  {name}: reusing {creds[key]}")
            continue
        data = builder(env)
        if data is None:
            print(f"  {name}: not in .env, the node keeps its placeholder")
            continue
        if dry:
            print(f"  {name}: would create ({cred_type})")
            continue
        created = n8n.create_credential(name, cred_type, data)
        creds[key] = created["id"]
        out[placeholder] = created["id"]
        save_state(state)
        print(f"  {name}: created {created['id']}")
    return out


def ensure_collection(env: dict, dry: bool) -> None:
    # The workflow reaches Qdrant from inside n8n; this script reaches it from the host. Same server,
    # different address when n8n is in Docker, which is why the host address is derived and not reused.
    url = qdrant_host_url(env)
    qd = Qdrant(url, env.get("QDRANT_COLLECTION", "docs"))
    if dry:
        print(f"  qdrant: would ensure collection '{qd.collection}' at {url}")
        return
    try:
        created = qd.ensure_collection(dim=Gemini.DIM)
    except Exception as e:  # noqa: BLE001 - the message matters more than the type
        sys.exit(f"Qdrant at {url} did not answer: {e}\n"
                 f"Start it with: docker compose up -d qdrant")
    print(f"  qdrant: collection '{qd.collection}' "
          f"{'created' if created else 'already there'}, {qd.count()} points")


def substitute(raw: str, mapping: dict) -> str:
    for placeholder, value in mapping.items():
        raw = raw.replace(placeholder, str(value))
    left = {p for p in mapping if p in raw}
    if left:
        print(f"  ! still unsubstituted: {', '.join(sorted(left))}")
    return raw


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    env = load_env()
    require(env, "N8N_API_KEY", "N8N_BASE_URL", "AIRTABLE_BASE_ID", "QDRANT_URL", "GEMINI_API_KEY")
    n8n = N8n(env["N8N_BASE_URL"], env["N8N_API_KEY"])
    state = load_state()

    # The shared secret for the re-index webhook. Generated once and kept in .deploy-state.json, which
    # is gitignored: the repo never carries it and .env is never rewritten behind your back.
    if not env.get("WEBHOOK_SECRET"):
        env["WEBHOOK_SECRET"] = state.get("webhook_secret") or secrets.token_urlsafe(24)
    state["webhook_secret"] = env["WEBHOOK_SECRET"]

    print("credentials")
    cred_ids = ensure_credentials(n8n, env, state, args.dry)
    print("vector store")
    ensure_collection(env, args.dry)

    mapping = {
        "__AIRTABLE_BASE__": env["AIRTABLE_BASE_ID"],
        "__QDRANT_URL__": env["QDRANT_URL"].rstrip("/"),
        "__QDRANT_COLLECTION__": env.get("QDRANT_COLLECTION", "docs"),
        "__TELEGRAM_CHAT_ID__": env.get("TELEGRAM_CHAT_ID", ""),
        # The chat page carries the shared secret so the browser can call /webhook/ask. It lands in
        # the deployed workflow, never in the repository.
        "__WEBHOOK_SECRET__": env["WEBHOOK_SECRET"],
        "__ERROR_WORKFLOW_ID__": state.get("workflows", {}).get("error", ""),
        **cred_ids,
    }

    # Telegram is optional, and n8n refuses to activate a workflow that has a node with an empty
    # required parameter. Left alone, an install without a bot token gets a workflow that cannot be
    # published, so no webhook is registered and the chat page answers 404 — with nothing on screen
    # to say why. A disabled node passes its input straight through, which is exactly what is wanted.
    telegram_ready = bool(env.get("TELEGRAM_BOT_TOKEN") and env.get("TELEGRAM_CHAT_ID"))

    def upsert(key: str, path: str, extra: dict | None = None) -> str | None:
        raw = (ROOT / path).read_text(encoding="utf-8")
        body = json.loads(substitute(raw, {**mapping, **(extra or {})}))
        if not telegram_ready:
            muted = [n["name"] for n in body["nodes"] if n["type"].endswith(".telegram")]
            for n in body["nodes"]:
                if n["type"].endswith(".telegram"):
                    n["disabled"] = True
            if muted:
                print(f"  {path}: no Telegram in .env, so {', '.join(muted)} "
                      f"{'is' if len(muted) == 1 else 'are'} disabled. Tickets are still written.")
        if args.dry:
            print(f"  would deploy {path}: {len(body['nodes'])} nodes")
            return None
        wf_id = state.setdefault("workflows", {}).get(key)
        if wf_id:
            try:
                n8n.update_workflow(wf_id, body)
                print(f"  {path}: updated {wf_id}")
                return wf_id
            except HttpError as e:
                # n8n 2.x archives a workflow instead of deleting it, and refuses to update an
                # archived one. Deploying again should heal that rather than leave a second copy.
                if e.status == 400 and "archived" in e.body.lower():
                    n8n.call("POST", f"/workflows/{wf_id}/unarchive")
                    n8n.update_workflow(wf_id, body)
                    print(f"  {path}: unarchived and updated {wf_id}")
                    return wf_id
                if e.status != 404:
                    raise
                print(f"  {path}: {wf_id} is gone from n8n, creating a new one")
        created = n8n.create_workflow(body)
        state["workflows"][key] = created["id"]
        save_state(state)
        print(f"  {path}: created {created['id']}")
        return created["id"]

    print("workflow")
    # The error workflow goes first because the main one has to name it, and n8n ignores an error
    # workflow that is not active — a lesson from the Lead -> CRM case, where it silently did nothing.
    err_id = upsert("error", "error-workflow.json")
    if err_id:
        try:
            n8n.activate(err_id)
        except HttpError as e:
            print(f"  could not activate the error workflow: {e}")
        mapping["__ERROR_WORKFLOW_ID__"] = err_id

    wf_id = upsert("main", "workflow.json")
    if args.dry:
        return

    # Activating is not optional: an inactive workflow registers no webhooks, so the chat page and
    # the ask endpoint answer 404 and the whole thing looks broken after a clean install.
    try:
        n8n.activate(wf_id)
        print("  activated (the chat page and /webhook/ask are live)")
    except HttpError as e:
        print(f"  could not activate it: {e}\n  activate it by hand in the editor, top right.")

    save_state(state)
    base = env["N8N_BASE_URL"].rstrip("/")
    print(f"\nthe workflow   {base}/workflow/{wf_id}")
    print(f"the chat page  {base}/webhook/chat")
    print("\nnothing is indexed yet. Run 'Index now' in the editor, or:")
    print(f"  curl -X POST {base}/webhook/reindex -H \"x-webhook-secret: "
          f"{state['webhook_secret']}\" -H \"Content-Type: application/json\" -d \"{{}}\"")


if __name__ == "__main__":
    main()
