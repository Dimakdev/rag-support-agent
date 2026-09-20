// [6] The cheapest step in the run, and the one that saves the most money. Every document carries a
// hash of its whole text; if the index already holds that hash for that document, nothing about it
// has changed and it is dropped here — before chunking, before a single embedding is paid for.
//
// The same FNV-1a-based hash as the chunker. It has to be the same function: this decides whether the
// chunker runs at all.
const OFFSETS = [0x811c9dc5, 0x01000193, 0x9dc5811c, 0xc5811c9d];

function fnv128(str) {
  const h = OFFSETS.slice();
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    for (let k = 0; k < 4; k++) {
      h[k] ^= c + k;
      h[k] = Math.imul(h[k], 0x01000193) >>> 0;
    }
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

// What Qdrant already holds, as {doc_url: doc_version} and the set of chunk hashes per document.
// The scroll ran once (the node is set to execute once), so it arrives as this node's only input.
const points = (($input.first().json || {}).result || {}).points || [];
// Versions are collected as a set, not as a single value, and that is not fussiness. A partial
// update leaves the chunks it did not touch carrying the previous version, so one document can hold
// several versions at once. Reading "the" version from whichever chunk the scroll returned first
// once made a document with deleted text look unchanged, and the deleted text stayed answerable.
const known = {};
for (const p of points) {
  const pl = p.payload || {};
  if (!pl.doc_url) continue;
  const entry = known[pl.doc_url] || (known[pl.doc_url] = { versions: new Set(), hashes: [] });
  if (pl.status !== 'active') continue;
  entry.versions.add(pl.doc_version);
  entry.hashes.push(pl.hash);
}

const all = $('Merge docs').all().map((i) => i.json);
const docs = all.filter((d) => !d.failed);
const failed = all.filter((d) => d.failed);

const toIndex = [];
const unchanged = [];
for (const doc of docs) {
  const version = fnv128(String(doc.text || '').replace(/\r\n/g, '\n').trim());
  const entry = known[doc.doc_url];
  // Unchanged means every chunk of this document agrees, and agrees with the file on disk. Anything
  // else — a mixed set, a stale stamp, no chunks at all — is re-indexed. It is cheap to be wrong in
  // this direction: the chunks that really did not change keep their hash and cost no embedding.
  const settled = entry && entry.versions.size === 1 && entry.versions.has(version);
  if (settled) unchanged.push(doc.doc_url);
  else toIndex.push({ ...doc, doc_version: version });
}

// Documents the index knows about that no source returned this time. They are not deleted: their
// chunks stop being searchable and stay visible, so "why did the agent stop knowing this" has an
// answer.
const seen = new Set(docs.map((d) => d.doc_url));
const gone = Object.keys(known).filter((url) => !seen.has(url));

// One state item first, then one item per document that actually needs work. The state item carries
// the whole picture of the run so that the nodes at the end do not have to reconstruct it.
const state = {
  is_state: true,
  started_at: new Date().toISOString(),
  docs_read: docs.length,
  unchanged,
  gone,
  failed,
  known_hashes: Object.fromEntries(Object.entries(known).map(([url, e]) => [url, e.hashes])),
  to_index: toIndex.map((d) => d.doc_url),
};

return [{ json: state }, ...toIndex.map((d) => ({ json: d }))];
