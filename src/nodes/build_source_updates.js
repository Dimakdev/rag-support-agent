// [20] Each source gets its own line of truth back: when it was last read, how much it holds now, and
// whether it is failing. Chunk counts include what was already in the index, not just what this pass
// wrote — the column answers "how big is this source", not "how busy was tonight".
const state = $('Plan documents').first().json;
const docs = $('Merge docs').all().map((i) => i.json);
const chunks = $('Chunk documents').all().map((i) => i.json).filter((c) => !c.is_state);
const sources = $('Load sources').all().map((i) => i.json).filter((s) => !s.no_sources);

const knownCount = {};
for (const [url, hashes] of Object.entries(state.known_hashes || {})) knownCount[url] = hashes.length;
const freshCount = {};
for (const c of chunks) freshCount[c.doc_url] = (freshCount[c.doc_url] || 0) + 1;

const out = [];
for (const source of sources) {
  const mine = docs.filter((d) => d.source_id === source.source_id);
  const failed = mine.filter((d) => d.failed).length;
  const ok = mine.filter((d) => !d.failed);
  const chunkTotal = ok.reduce((n, d) => n + (freshCount[d.doc_url] ?? knownCount[d.doc_url] ?? 0), 0);

  // Three failures in a row is a degrading source, seven is a retired one. A single bad night is
  // weather; the counter is what turns weather into a decision.
  const failures = failed && !ok.length ? source.failures + 1 : 0;
  const status = failures >= 7 ? 'Retired' : failures >= 3 ? 'Degrading' : 'Active';

  out.push({
    json: {
      record_id: source.record_id,
      body: {
        typecast: true,
        fields: {
          'Last indexed': new Date().toISOString(),
          Docs: ok.length,
          Chunks: chunkTotal,
          Failures: failures,
          Status: status,
        },
      },
    },
  });
}

return out;
