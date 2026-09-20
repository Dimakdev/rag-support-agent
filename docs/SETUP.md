# Setting it up

About twenty minutes, most of it waiting for Docker.

## What you need

- Docker, for n8n and Qdrant.
- Python 3.10 or later. No packages to install: the scripts use the standard library only.
- A Gemini API key — https://aistudio.google.com/apikey. One key covers both jobs (embeddings and
  answers).
- An Airtable account and an empty base.
- A Telegram bot, if you want to be told about tickets. Optional; everything works without it.

## 1. The two containers

```bash
cp .env.example .env
docker compose up -d
```

n8n comes up on http://localhost:5678 and asks you to create the owner account. Qdrant comes up on
http://localhost:6333 with a dashboard at `/dashboard`.

The compose file sets `N8N_RESTRICT_FILE_ACCESS_TO=/data/corpus`. Leave it. n8n refuses all file
access from nodes unless a folder is named, and this names exactly one: the corpus, read-only.
Without it the markdown source fails with "Access to the file is not allowed", which looks like a bug
and is a setting.

**If you already run n8n somewhere else**, do not start the one in this compose file. Set `QDRANT_URL`
in `.env` to an address that your n8n can reach — `http://host.docker.internal:6333` when n8n is in
Docker on the same machine — and mount the corpus folder into that container at `/data/corpus`.

## 2. The keys

In n8n: **Settings → n8n API → Create an API key**. Put it in `.env` as `N8N_API_KEY`.

In Airtable: create an empty base, copy its id from the URL (`app…`), and create a token at
https://airtable.com/create/tokens with these scopes:

- `schema.bases:read`, `schema.bases:write`
- `data.records:read`, `data.records:write`

and access to that base. A token scoped to a different base fails with a 403 that says nothing useful;
this is the most common way to get stuck.

Fill in `GEMINI_API_KEY`. Leave `WEBHOOK_SECRET` empty — the deploy script generates one and keeps it
in `.deploy-state.json`, which is gitignored. Your `.env` is never written to.

## 3. Build it

```bash
python scripts/seed_airtable.py     # six tables and their starting values
python scripts/build_workflow.py    # workflow.json and error-workflow.json from src/
python scripts/deploy.py            # credentials, the Qdrant collection, both workflows
```

Every one of these can be run again. Tables that exist are left alone, fields that are missing are
added, credentials are reused, the workflow is updated rather than duplicated.

## 4. Index, then ask

Open the workflow n8n printed a link to and run **Index now**. Eighteen documents become 37 chunks in
about a second.

Then open http://localhost:5678/webhook/chat and ask it something. Try "can I get a refund on an
annual plan after 20 days?", and then "and monthly?".

## 5. Check it

```bash
python scripts/run_tests.py    # 24 checks against your instance, nothing mocked
python scripts/run_evals.py    # 25 questions with known answers, writes a row to Eval Runs
```

Run the evals again after you change the corpus, the thresholds or the model. The difference between
two rows is the only honest answer to "did that make it better".

## Your own documents

Add a row to **Sources**:

- `markdown` — a folder mounted into n8n. Address is the path *inside the container*, e.g. `/data/corpus`.
- `url` — one page. Address is the full address of the page.

Set the sample source to `Paused`, index, and ask something only your documents know.

## When something does not work

**"Access to the file is not allowed"** — the folder is not in `N8N_RESTRICT_FILE_ACCESS_TO`, or not
mounted into the container at all.

**Airtable 403 on the first script** — the token does not have the base, or is missing a schema scope.

**Qdrant refuses to connect from the workflow** — `QDRANT_URL` is the address *n8n* must use, not the
one your browser uses. Inside this compose it is `http://qdrant:6333`.

**A question answers but the sources are empty** — the citation check threw the answer away and the
reply you are reading is the escalation. The ticket says which of the three checks failed.

**Everything escalates** — the index is empty. Run an indexing pass; `run_tests.py --case contract`
says so plainly.
