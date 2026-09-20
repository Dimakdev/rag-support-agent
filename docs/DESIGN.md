# Why it is built this way

The decisions that cost something, and what they were weighed against. Where a number appears, it was
measured on the sample corpus rather than chosen because it looked reasonable.

## The model is not allowed an opinion

A model asked to answer from extracts will usually do it, and will occasionally add a sentence that
was not there. You cannot tell which by reading the answer, and neither can the person who asked.

So the model returns a structure with a quote for every claim, and code checks the quotes: the cited
id must be one that was put in front of it, and the quote must appear in that extract, word for word,
with whitespace treated loosely. A failure is not a retry and not a repair — the answer is discarded
and the question goes to a person with `citation_mismatch` recorded.

Nothing in that check asks the model anything. A model that invented a citation will confirm it as
confidently as a real one.

## Three outcomes rather than one

Most demos have one exit: an answer. Real support has three, and the other two are where the value is.

`clarify` costs one round trip and saves a wrong answer. `escalate` costs a person's minute and saves
the thing that destroys trust in these systems: a confident paragraph about something the company
never said.

The reason for an escalation is stored as a category, not a sentence, because the distribution is the
useful part. A week of `nothing_found` is a list of pages somebody should write. A week of
`citation_mismatch` means the model is drifting and the prompt needs work. A week of `always_human`
means the keyword rule is too eager.

## Two thresholds, and what neither of them can do

**Similarity** decides whether the model is called at all. Measured on this corpus with
`gemini-embedding-001` at 768 dimensions: twelve questions the documents answer scored 0.654–0.758;
ten off-topic questions scored 0.492–0.643. Default: 0.55.

The gap between the groups is 0.01, and that is the finding. The two highest off-topic scores were
"what is your refund policy for the hotel I booked" (0.639) and "do you offer student discounts"
(0.643) — the second one is a question a real customer asks, is about our actual subject, and has no
answer in the documents. **No threshold separates "we have no answer" from "this sounds like us".**

So the threshold does only what it can: it stops obvious nonsense before any money is spent. On 0.55
it removes seven of ten off-topic questions and touches none of the real ones. The rest is the
citation check's job, and it does it by construction — there is no sentence to quote.

**Confidence** is the model's own 0–100, and it is a weak signal: a model that misunderstood a
question is confident about its misunderstanding. It is used as a floor, not as a score.

## Chunking

Cut on the document's own headings, then on paragraphs. Target 900 characters, ceiling 1400, overlap
150 inside a section. Markdown tables are never split — rows without a header are worse than a chunk
slightly over target.

The first version produced a median chunk of 205 characters, because a help centre is full of short
sections. Chunks that small match precisely and tell the model almost nothing. Whole neighbouring
sections are now merged up to the target, which brought the median to 753.

Merging costs something: the merged chunk's heading path shrinks to what its pieces share, and a
citation would point at the page instead of the section. So each merged chunk carries a `sections`
map — the sub-heading and the offset where it starts — and a quote is matched back to the sub-section
it came from.

Two details in that lookup were wrong on the first attempt and are worth naming. The offsets are
measured in the original text, and the quote was first located in a whitespace-collapsed copy, which
put citations under the neighbouring heading. And the heading path of the *first* merged piece was
dropped rather than inlined, so its own sub-heading disappeared.

## The embedding

`gemini-embedding-001`, 768 dimensions, cosine. 3072 is available and does not pay for itself on a
corpus this size.

Documents are embedded with `taskType: RETRIEVAL_DOCUMENT` and questions with `RETRIEVAL_QUERY`. The
two are different jobs — a question and the paragraph that answers it are worded differently — and the
models are trained for that asymmetry. Most tutorials leave the parameter out and lose accuracy for
nothing.

The heading path is embedded together with the chunk text. "Annual plans" above a paragraph about
money changes what that paragraph is about.

## Finding the page is not finding the answer

Retrieval returns chunks, and the chunk that looks most like the question is not always the chunk that
answers it. "What happens if my card fails three times" matched the billing page's first half while
the answer sat in its second.

So after the search, the rest of the best-matching document is pulled in and offered to the model
below the real hits. It never decides which document is chosen — only what the model gets to read once
it has been. One extra request to a local vector store.

## Idempotent indexing

Three levels, each one cheaper than the one below it:

1. The document's hash matches → nothing happens to it at all.
2. The chunk's hash is already in the index → no embedding is paid for.
3. Otherwise embed, in batches of a hundred.

A chunk's id is its hash folded into a UUID, because Qdrant accepts integers and UUIDs and not
arbitrary strings. That makes "the same text" and "the same point" the same statement.

**The version trap.** Because unchanged chunks are not rewritten, they keep the previous version
stamp, and a document can hold two versions at once. Reading "the" version from whichever chunk came
back first made a document with deleted text look unchanged — and the deleted text stayed answerable.
A document now counts as unchanged only when every one of its chunks agrees, and every surviving chunk
is re-stamped after a pass. `run_tests.py` has a case for the whole life cycle: a file appears, is
answered from, disappears, and stops being answered from.

## Documents are data

A corpus contains what many people wrote, and a public help centre contains what someone else wrote.
An instruction sitting inside a document is a sentence, not a command.

Three layers, in order of cost: the prompt says so; lines that look like instructions to a model are
removed before the extract is shown; and the citation check catches the consequences if the first two
missed something, because an invented policy has no sentence behind it.

## What was tried and taken out

**Turning short refusals into clarifying questions.** The theory was that asking costs less than a
person. It helped on "what are the limits?" and broke "what is your uptime SLA?" — five words,
perfectly specific, and an honest "we have nothing on that" became "did you mean security, billing or
limits?". Word count cannot tell vague from absent. Reverted, with the reasoning left in the code.

**A fallback model that is a second chain, not a setting.** The chain node in this n8n version has no
fallback of its own, so it is two chains wired error-output to input. Ugly in the canvas, explicit in
the logs.

## What is measured, and how

`evals/questions.json` holds 25 questions of four kinds: answerable with a known source, not
answerable, ambiguous, and an instruction aimed at the model. `run_evals.py` sends them through the
same webhook a person uses, with one flag set, and writes a row to Eval Runs with the number of
indexed chunks beside the score.

A question may name more than one acceptable outcome. "What are the limits?" can reasonably be
answered in full or asked back about, and the model picks differently between runs at temperature
zero; giving up is the only wrong answer, so that is what the case tests.

The first run scored 84% on outcomes and 92.9% on citations. What the failures turned out to be is
the most useful paragraph in this document: one was a real retrieval gap (the billing page), one was a
keyword rule that was too eager, two were mistakes in the test set itself, and one was a heuristic
that had to be reverted. Only the first two were bugs in the agent.
