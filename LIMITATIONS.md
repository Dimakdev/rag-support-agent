# What this does not do

Written before anyone asks, because software that only lists its strengths is an advertisement.

## By design

**One corpus, one audience.** There is no notion of who is asking. Every question is answered from
every active document, so a corpus that mixes public help pages with internal notes will happily
quote the internal ones. Per-user permissions are a filter on the search — the vector store supports
it and the field is not there. Adding it means deciding who may see what, which is a conversation,
not a feature flag.

**No multi-tenancy.** Two clients means two deployments. Sharing one would mean a tenant filter on
every search and on every write, and an error in that filter is a data leak, so it is not something
to bolt on afterwards.

**The "send this to a person" rule is keywords.** A regular expression in the Settings table decides
which questions never reach the model — questions about someone's own money, account or legal
position. Keywords are blunt: during testing this rule sent "what happens if my card fails three
times" to a human, because it contained "my card". That question is about the product and the
documents answer it. The pattern was narrowed; the class of error remains, and it errs towards a
person, which is the safe direction. The eval set is where you see it.

**Vector search only.** No keyword search alongside it. Embeddings are good at meaning and poor at
exact tokens: error codes, SKUs, version numbers, surnames. A corpus full of those wants hybrid
search, which is a second index and a merge step, and this one does not have it.

**No reranking.** The five extracts that reach the model are the five nearest by vector. A cross-
encoder reading the question and each candidate together would order them better, at the cost of one
more model call per question. The setting is reserved; turn it on when you can show that the answer
was sitting at position six.

**One step of memory, not a conversation.** The session remembers the last question, the last
outcome and the documents the last answer stood on. That is enough for "and monthly?" to work. It is
not a chat history, and the agent will not follow a thread five turns deep.

**No OCR and no images.** A scanned PDF is skipped and said to be skipped. Diagrams, screenshots and
anything whose meaning is in a picture are invisible.

**No multi-hop.** A question whose answer must be assembled from three documents will usually be sent
to a person. Chaining retrieval steps is a different design, with different failure modes and much
harder testing.

## Operational

**The chat page carries the shared secret.** It has no login, so the secret it uses to call the API
is readable by anyone who can open the page. On localhost that is fine. In public, put it behind your
own authentication or a proxy that adds the header, and do not serve the page as it ships.

**Qdrant runs without authentication.** Inside one Docker network that is normal; exposed on a public
address it is not. The compose file publishes port 6333 for convenience, which is the first thing to
change on a real deployment.

**The similarity threshold is corpus-specific.** 0.55 was measured against this corpus and this
embedding model: real questions scored 0.654–0.758, off-topic ones 0.492–0.643. Your corpus will sit
somewhere else. Measure it before trusting it, and remember what it cannot do — see below.

**A threshold cannot tell "absent" from "adjacent".** This is the single most useful thing measured
here. "Do you offer student discounts?" scored 0.642 against a corpus that says nothing about student
discounts — higher than several questions that do have answers. No number separates those two. The
citation check does, because there is no sentence to quote.

**Cost in the run row is an estimate.** Characters divided by four, times a rate written as a named
constant in one file. It is the right order of magnitude and it is not a bill.

**Models are not deterministic, even at temperature zero.** The same vague question came back as a
clarifying question on one run and as a refusal on the next. Where that mattered, the eval set accepts
either, and the thing it refuses to accept is giving up.

**Airtable answers about five requests a second.** Every answer writes one row. A busy support desk
would want a queue in front of it, or a different store.

**n8n blocks file access by default.** The corpus is read through `N8N_RESTRICT_FILE_ACCESS_TO`,
which is set to exactly the corpus folder and nothing else. Without it the markdown source fails with
"Access to the file is not allowed", which reads like a bug and is a setting.

## Found by running it

**A document can hold two versions of itself.** When a page is re-indexed, the chunks that did not
change are not rewritten, so they keep the old version stamp. Reading "the" version from whichever
chunk came back first made a document with deleted text look unchanged, and the deleted text stayed
answerable — the worst thing a support agent can do. A document is now unchanged only when all of its
chunks agree, and every surviving chunk is re-stamped after a pass. There is a test for it.

**Finding the right page is not finding the answer.** "What happens if my card fails three times"
matched the billing page — its first half, while the answer was in its second. The fix is to pull the
rest of the best-matching document into the context whether the search asked for it or not. Without
that step everything looks like it worked, including the refusal.

**A heuristic that was tried and reverted.** Turning a short refusal into a clarifying question, on
the theory that asking is cheaper than a person. It helped on "what are the limits?" and hurt on
"what is your uptime SLA?" — five words, perfectly specific, and the honest "we have nothing on that"
became "did you mean security, billing or limits?". Word count cannot tell vague from absent. The
reasoning is left in the code so that nobody tries it twice.
