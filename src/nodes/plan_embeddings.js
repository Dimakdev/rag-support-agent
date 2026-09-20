// [11] What actually has to be paid for. A document whose version changed still keeps most of its
// paragraphs, and those paragraphs keep their hash, so this node asks the index which of the chunks
// it already holds and embeds only the rest. Editing one sentence in a page costs one chunk, not a
// whole page.
const BATCH = 100;                       // the API's own ceiling for one batchEmbedContents call
const MODEL = 'gemini-embedding-001';
const DIM = 768;                         // measured to be enough; see docs/DESIGN.md
const TASK = 'RETRIEVAL_DOCUMENT';       // a paragraph is embedded for a different job than a question

const existing = new Set((($input.first().json || {}).result || []).map((p) => String(p.id)));
const chunks = $('Chunk documents').all().map((i) => i.json).filter((c) => !c.is_state);
const fresh = chunks.filter((c) => !existing.has(c.chunk_id));

if (!fresh.length) {
  return [{ json: { nothing_to_embed: true, chunks: chunks.length, already_indexed: existing.size } }];
}

// The heading path is embedded together with the text. "Annual plans" over a paragraph about money
// changes what that paragraph is about, and leaving it out throws away the structure the writer gave us.
const batches = [];
for (let i = 0; i < fresh.length; i += BATCH) {
  const slice = fresh.slice(i, i + BATCH);
  batches.push({
    json: {
      batch: batches.length,
      chunk_ids: slice.map((c) => c.chunk_id),
      body: {
        requests: slice.map((c) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text: `${c.heading_path}\n${c.text}` }] },
          taskType: TASK,
          outputDimensionality: DIM,
        })),
      },
    },
  });
}

return batches;
