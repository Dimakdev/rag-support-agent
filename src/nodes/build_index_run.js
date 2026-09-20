// [18] One row that answers "what did last night's pass actually do". Eight numbers instead of a log
// nobody opens: read, new, updated, retired, unchanged, seconds, cost, and whatever went wrong.
//
// The rate below is the one thing here that goes stale on its own. It is a constant with a name so
// that it is obvious what to change, and the column says "estimated" rather than pretending to be
// a bill.
const USD_PER_MILLION_INPUT_TOKENS = 0.15;
const CHARS_PER_TOKEN = 4;               // good enough for an order of magnitude, wrong for a receipt

const state = $('Plan documents').first().json;
const chunks = $('Chunk documents').all().map((i) => i.json).filter((c) => !c.is_state);
const plans = $('Plan embeddings').all().map((i) => i.json);
const cleanup = $input.all().map((i) => i.json).find((i) => i.is_summary) || {};

const embedded = plans.filter((p) => !p.nothing_to_embed)
  .reduce((n, p) => n + p.chunk_ids.length, 0);
const embeddedChars = plans.filter((p) => !p.nothing_to_embed)
  .flatMap((p) => p.body.requests)
  .reduce((n, r) => n + r.content.parts[0].text.length, 0);
const cost = (embeddedChars / CHARS_PER_TOKEN / 1e6) * USD_PER_MILLION_INPUT_TOKENS;

// A document counts as new when the index had never heard of it, and as updated when it had.
const known = state.known_hashes || {};
const newDocs = (state.to_index || []).filter((u) => !known[u]).length;
const updatedDocs = (state.to_index || []).length - newDocs;

const errors = [];
for (const f of state.failed || []) errors.push(`${f.doc_url}: ${f.reason}`);

const started = new Date(state.started_at);
const seconds = Math.round((Date.now() - started.getTime()) / 100) / 10;

return [{
  json: {
    body: {
      typecast: true,
      fields: {
        Run: `${started.toISOString().slice(0, 16).replace('T', ' ')} index`,
        Started: started.toISOString(),
        'Docs read': state.docs_read || 0,
        New: newDocs,
        Updated: updatedDocs,
        Retired: cleanup.retired_docs || 0,
        Unchanged: (state.unchanged || []).length,
        Seconds: seconds,
        Cost: Number(cost.toFixed(4)),
        Errors: errors.length ? errors.join('\n') : '',
      },
    },
    // Repeated outside the body so the test can read them without unwrapping Airtable's envelope.
    summary: { chunks: chunks.length, embedded, seconds, cost: Number(cost.toFixed(4)) },
  },
}];
