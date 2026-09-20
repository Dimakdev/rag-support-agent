// [13] Vectors come back in the order they were asked for, so they are zipped with the batch that
// asked. The check below is not ceremony: if the API ever returns a different count, writing the
// vectors anyway would attach paragraphs to the wrong meaning, and every answer after that would be
// wrong in a way nobody could see.
const batches = $('Plan embeddings').all().map((i) => i.json);
const responses = $input.all().map((i) => i.json);
const byId = new Map($('Chunk documents').all()
  .map((i) => i.json).filter((c) => !c.is_state).map((c) => [c.chunk_id, c]));

const out = [];
for (let b = 0; b < responses.length; b++) {
  const plan = batches[b];
  const vectors = (responses[b].embeddings || []).map((e) => e.values);
  if (!plan || vectors.length !== plan.chunk_ids.length) {
    throw new Error(`embedding batch ${b}: asked for ${plan ? plan.chunk_ids.length : '?'} vectors, `
      + `got ${vectors.length}. Refusing to write vectors that may belong to other chunks.`);
  }

  const points = plan.chunk_ids.map((id, i) => {
    const c = byId.get(id);
    return {
      id,
      vector: vectors[i],
      payload: {
        chunk_id: c.chunk_id,
        hash: c.hash,
        source_id: c.source_id,
        doc_url: c.doc_url,
        doc_title: c.doc_title,
        doc_version: c.doc_version,
        heading_path: c.heading_path,
        sections: c.sections,
        text: c.text,
        lang: c.lang,
        position: c.position,
        status: 'active',
        indexed_at: new Date().toISOString(),
      },
    };
  });

  out.push({ json: { batch: b, count: points.length, body: { points } } });
}

return out;
