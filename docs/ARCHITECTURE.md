# How it is put together

Two branches in one n8n workflow, plus a small error workflow that only exists because n8n insists an
error handler be a separate workflow.

## Where state lives

Three places, and each one owns something the others do not hold:

| | |
| --- | --- |
| **Qdrant** | chunk text, vectors, and the payload that describes them |
| **Airtable** | everything a person looks at: sources, runs, settings, conversations, tickets, evals |
| **n8n** | the code, the credentials, the schedule |

Chunk text is not duplicated into Airtable, and no vector ever reaches it. There is one answer to
"where is the truth" for every kind of fact.

## Branch A — indexing

Runs nightly, by hand, or on `POST /webhook/reindex`. The last one exists so a CMS can re-index the
moment an article is published.

```
schedule / manual / webhook
        │
   Sources (Airtable)  ──►  by type  ──┬── markdown: read files → extract text
        │                              └── url: fetch → strip navigation → markdown
        │                                        │
        │                                   merge documents
        │                                        │
        │                    scroll Qdrant once (doc_url, doc_version, hash)
        │                                        │
        │                    plan: unchanged / to index / disappeared
        │                                        │
        │                            chunk by heading, merge short sections
        │                                        │
        │                       which chunk ids does the index already hold?
        │                                        │
        │                      embed only the new ones, in batches of 100
        │                                        │
        │                               write points to Qdrant
        │                                        │
        │              retire what disappeared, delete what was rewritten,
        │              stamp every surviving chunk with the new version
        │                                        │
        └──────────────► Index Runs row  +  Sources updated
```

Three things about it are load-bearing:

**A document is hashed whole before it is chunked.** If the hash matches what the index holds, nothing
else happens to it. This is why a nightly pass over an unchanged corpus costs nothing.

**A chunk's id is its hash.** Same text, same id, forever. Re-indexing writes the same point instead
of a duplicate, and "do you already have these?" is one request with a list of ids.

**Disappearing and being rewritten are different.** A document no source returns any more is *retired*:
its chunks stop being searchable and stay in the store with their text. A chunk that was rewritten is
*deleted*, because its replacement is already in and two versions of the same fact must never both be
findable.

## Branch B — answering

```
POST /webhook/ask
    │
Settings (Airtable) ──► open request: question, session, language
    │
empty? ──yes──────────────────────────────────────────────► a fixed reply
    │ no
find the session row ──► glue a short follow-up to the previous question
    │
about their own money or account? ──yes───────────────────► a person + ticket
    │ no
embed the question (RETRIEVAL_QUERY)
    │
search Qdrant (top 12, active only)
    │
pull in the rest of the best document
    │
build context: dedupe, stitch, quarantine instruction-like lines, keep five
    │
nothing above the threshold? ──yes────────────────────────► a person + ticket
    │ no
model → {outcome, answer, citations, confidence}       (retry, then a second model)
    │
validate the citations in code
    │
answer ──► clarify ──► escalate ──► ticket + Telegram
    │          │           │
    └──────────┴───────────┴──► render reply → upsert the conversation → respond
```

The chat page is served by the same workflow from `GET /webhook/chat`, so the page and the endpoint it
calls share an origin by construction.

## The contracts

**A chunk**, in Qdrant's payload: `chunk_id, hash, source_id, doc_url, doc_title, doc_version,
heading_path, sections, text, lang, position, status, indexed_at`.

`sections` is the unusual one. Short sections are merged so that a chunk carries a whole thought, and
`sections` records where each merged sub-heading starts. A citation can then point at
"Refunds / Monthly plans" rather than at the page.

**What the model sees**, and nothing else:

```
[chunk_id] heading path
the text
---
```

No urls — it cannot cite a link it has not read. No similarity scores — it should judge the content,
not the search's confidence. Links are attached afterwards, from the payload of the chunks it quoted.

**What the model returns**: `outcome`, `answer`, `citations[{chunk_id, quote}]`, `confidence`,
`reason`, enforced by a structured output parser.

## Reliability

Every model call retries once, then falls back to a second model, then escalates to a person. Never a
third attempt: a model that has failed twice on the same question will not succeed on the third.

The Telegram node is set to continue on error, so a misconfigured bot can never swallow a ticket that
has already been written down.

Anything that escapes reaches the error workflow, which names the branch that failed and the execution
id where the data still sits.

## Swapping pieces

**Qdrant for pgvector** — the store is reached over plain REST from four nodes. pgvector needs the
same four calls: upsert with an explicit id, retrieve by ids, search with a payload filter, set
payload by filter.

**Gemini for another provider** — two HTTP nodes for embeddings and one chain node for the answer.
The embedding dimension is a constant in one Code node and the collection's configuration.

**Airtable for Notion, Postgres, a spreadsheet** — it is reached through HTTP Request nodes with raw
API bodies built in Code nodes, so what changes is the body, not the shape of the workflow.
