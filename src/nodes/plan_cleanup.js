// [16] Two different kinds of stale, handled differently on purpose.
//
// A document that no source returned any more is RETIRED: its chunks stop being searchable and stay
// in the index with their text. Six months later "why did the agent stop knowing about refunds" has
// an answer instead of a shrug.
//
// A paragraph that was rewritten is DELETED: its replacement is already in, and keeping the old text
// around means two versions of the same fact can both be found. That is the one thing a support agent
// must never do.
const state = $('Plan documents').first().json;
const chunks = $('Chunk documents').all().map((i) => i.json).filter((c) => !c.is_state);

const ops = [];

if ((state.gone || []).length) {
  ops.push({
    op: 'retire',
    url: '/points/payload?wait=true',
    doc_urls: state.gone,
    body: {
      payload: { status: 'retired', retired_at: new Date().toISOString() },
      filter: { must: [{ key: 'doc_url', match: { any: state.gone } }] },
    },
  });
}

// Per document, because "keep these hashes" only means anything inside one document.
const byDoc = {};
const versionOf = {};
for (const c of chunks) {
  (byDoc[c.doc_url] || (byDoc[c.doc_url] = [])).push(c.hash);
  versionOf[c.doc_url] = c.doc_version;
}

for (const [docUrl, keep] of Object.entries(byDoc)) {
  const had = (state.known_hashes || {})[docUrl] || [];
  const superseded = had.filter((h) => !keep.includes(h));
  if (superseded.length) {
    ops.push({
      op: 'delete',
      url: '/points/delete?wait=true',
      doc_urls: [docUrl],
      count: superseded.length,
      body: {
        filter: {
          must: [{ key: 'doc_url', match: { value: docUrl } }],
          must_not: [{ key: 'hash', match: { any: keep } }],
        },
      },
    });
  }

  // Stamp every surviving chunk of this document with the version it now belongs to. Without this
  // the chunks that were kept keep yesterday's stamp, the document ends up holding two versions at
  // once, and the next pass has to guess which one is the truth. It guessed wrong once.
  ops.push({
    op: 'stamp',
    url: '/points/payload?wait=true',
    doc_urls: [docUrl],
    body: {
      payload: { doc_version: versionOf[docUrl] },
      filter: { must: [{ key: 'doc_url', match: { value: docUrl } }] },
    },
  });
}

// The summary item always exists, so the nodes after this one always have something to run on even
// when there was nothing to clean up.
return [
  ...ops.map((o) => ({ json: { ...o, is_op: true } })),
  { json: { is_op: false, is_summary: true, retired_docs: (state.gone || []).length,
            deleted_ops: ops.filter((o) => o.op === 'delete').length,
            superseded_chunks: ops.filter((o) => o.op === 'delete')
              .reduce((n, o) => n + o.count, 0) } },
];
