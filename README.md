# A support agent that answers from your documents, or says it cannot

It reads your help centre, answers questions from it, and shows the sentence it took each answer
from. When your documents do not cover the question, it does not improvise: it says so and opens a
ticket for a person, with what it found and why that was not enough.

The part that took the work is not the retrieval. It is the refusal.

```
   your documents ──► chunk ──► embed ──► Qdrant
                                            │
   a question ──► embed ──► search ──► the five best extracts
                                            │
                                          model
                                            │
                              ┌─────────────┴─────────────┐
                              │  does every claim quote   │   ← code, not the model
                              │  a sentence we gave it?   │
                              └─────────────┬─────────────┘
                                  yes │            │ no
                                      ▼            ▼
                              answer + sources   a person, with a ticket
```

## How a question goes

The question arrives at a webhook — from the chat page this repo serves, or from anything else that
can post JSON.

Before anything is spent: if it is about the person's own money, account or legal position, it goes
straight to a human. Documents cannot answer "why was I charged twelve dollars on the third", and a
confident paragraph about the refund policy would be worse than silence.

Otherwise it is embedded and searched. If nothing comes back above the similarity threshold, the
model is never called — the question goes to a person with "nothing came close" written on it. That
is the cheap half of honesty.

What does come back is assembled: deduplicated by document, neighbouring chunks stitched together,
and the rest of the best-matching document pulled in whether the search asked for it or not. Five
extracts reach the model. Each one is quarantined first — lines that read like instructions to a
model are removed, because a document is data and not a command.

The model sees the question and those five extracts, and returns a structure: an outcome, an answer,
citations, a confidence. Then the code takes over and checks three things: that an answer cites
something, that every cited id was actually put in front of it, and that every quote appears word for
word in that extract. Any of those failing throws the answer away and sends the question to a person
with `citation_mismatch` on the ticket. A model that invented a citation will confirm it just as
fluently as a real one, so nothing about this check asks the model anything.

## Three outcomes, on purpose

**answer** — with the sentences it stands on, and where in the document they are.

**clarify** — one short question back, when the question has two readings with different answers.
"How long do I have?" is four different numbers in this corpus.

**escalate** — a ticket, a Telegram message, and an honest sentence to the person. The reason is
recorded as a category, and the distribution of those categories is the most useful thing the system
produces: `nothing_found` is a hole in your documentation, not a broken agent.

## What lives in a table instead of in the code

Six tables in Airtable. Sources: where documents are read from. Settings: the thresholds, the models,
the rule about what never reaches the model. Index Runs: eight numbers per indexing pass.
Conversations, Tickets, Eval Runs.

Changing how picky the agent is means editing a row. During this build the "send it to a person" rule
turned out to be too eager twice, and both fixes were a row, not a redeploy.

## Numbers from the sample corpus

Eighteen documents, 37 chunks. Measured on a laptop, against Gemini's embedding and flash-lite models.

| | |
| --- | --- |
| First index | 1.2 s, about $0.001 |
| Re-index, nothing changed | 0.1 s, nothing embedded, $0 |
| Re-index after editing one page | one chunk embedded, not eighteen |
| A question, end to end | 2.7 s median |
| Eval set | 25 of 25 outcomes, 16 of 16 citations correct |

The similarity threshold, 0.55, was measured rather than guessed: questions the corpus answers scored
0.654–0.758, off-topic questions 0.492–0.643. The gap is 0.01, and the lesson is in `LIMITATIONS.md`:
a threshold separates nonsense from questions, and cannot separate "we have no answer" from "this
sounds like us". The citation check does that.

## Running it

```bash
cp .env.example .env          # Gemini key, Airtable token, n8n key, Telegram (optional)
docker compose up -d          # n8n on :5678, Qdrant on :6333
python scripts/seed_airtable.py
python scripts/build_workflow.py
python scripts/deploy.py
```

Then open the workflow and run **Index now**, or `curl` the re-index webhook. The chat page is at
`/webhook/chat`.

```bash
python scripts/run_tests.py   # 24 checks against your own running instance
python scripts/run_evals.py   # the 25 questions, and a row in Eval Runs
```

## Pointing it at your own documents

Two source types. `markdown` reads a folder mounted into n8n — that is how the sample corpus is
indexed. `url` reads one page per row, strips navigation and footers, and turns headings into
headings so that the structure survives into the citation.

Add a row to Sources, set the old one to Paused, index. Nothing is rebuilt and nothing is redeployed.

## The files

| | |
| --- | --- |
| `corpus/` | the sample help centre. A made-up company; see its README |
| `src/nodes/*.js` | every Code node, one file each, assembled into the workflow by a script |
| `src/page/chat.html` | the chat page n8n serves |
| `schema/airtable.json` | the six tables, and the values they start with |
| `evals/questions.json` | 25 questions with the answers known in advance |
| `scripts/` | build, deploy, seed, test, evaluate |
| `docs/` | how it is built, why it is built that way, how to set it up |
| `LIMITATIONS.md` | what it does not do, and what broke while building it |

## What it does not do

Read `LIMITATIONS.md`. Briefly: one corpus with no per-user permissions, vector search without a
keyword index, no reranking, one step of memory, no OCR, and a chat page that carries its own secret.
Each of those is a decision with a reason, and the reasons are written down.

MIT licensed.
