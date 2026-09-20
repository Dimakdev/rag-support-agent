#!/usr/bin/env python3
"""Create the five tables in an Airtable base and put the two starter Source rows in.

Airtable's API cannot create a base, only tables inside one, so make an empty base by hand first and
put its id (app...) in .env. Running this twice is safe: tables and fields that already exist are left
alone, and the seed rows are only written into an empty table.

Run:  python scripts/seed_airtable.py            (add --dry to see what it would do)
"""
from __future__ import annotations

import argparse
import sys

from common import Airtable, HttpError, load_env, load_schema, load_state, require, save_state


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="print the plan, change nothing")
    args = ap.parse_args()

    env = load_env()
    require(env, "AIRTABLE_PAT", "AIRTABLE_BASE_ID")
    at = Airtable(env["AIRTABLE_PAT"], env["AIRTABLE_BASE_ID"])
    schema = load_schema()

    try:
        existing = {t["name"]: t for t in at.tables()}
    except HttpError as e:
        if e.status in (401, 403):
            sys.exit("Airtable refused the token. It needs schema.bases:read, schema.bases:write, "
                     "data.records:read and data.records:write, and access to this base.")
        raise
    print(f"base {env['AIRTABLE_BASE_ID']}: {len(existing)} tables already there")

    state = load_state()
    tables = state.setdefault("airtable", {})

    for spec in schema["tables"]:
        name = spec["name"]
        if name in existing:
            table = existing[name]
            have = {f["name"] for f in table["fields"]}
            missing = [f for f in spec["fields"] if f["name"] not in have]
            print(f"  = {name}: exists, {len(missing)} field(s) missing")
            for field in missing:
                if args.dry:
                    print(f"      + would add field {field['name']}")
                else:
                    at.create_field(table["id"], field)
                    print(f"      + added field {field['name']}")
        elif args.dry:
            print(f"  + would create {name} with {len(spec['fields'])} fields")
            continue
        else:
            table = at.create_table(spec)
            print(f"  + created {name} ({table['id']})")
        tables[name] = table["id"]

    # Seed rows only into a table nobody has touched: this script must never overwrite real sources.
    for name, rows in schema.get("seed", {}).items():
        if args.dry:
            print(f"  ~ would seed {name} with {len(rows)} row(s) if empty")
            continue
        if at.records(name, max_records=1):
            print(f"  = {name}: not empty, seed skipped")
            continue
        for row in rows:
            at.create(name, row)
        print(f"  + seeded {name} with {len(rows)} row(s)")

    if not args.dry:
        save_state(state)
        print("\ntable ids written to .deploy-state.json")


if __name__ == "__main__":
    main()
