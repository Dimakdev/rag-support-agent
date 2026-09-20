// [4a] The markdown adapter's second half. "Read Files" hands over the file names, "Extract From File"
// hands over the text and keeps nothing else — verified against n8n 2.39: same count, same order, the
// json is replaced by `{content}` alone. So the two are zipped by index, which is the only thing both
// nodes guarantee.
const texts = $input.all();
const files = $('Read files').all();

// With two markdown sources the files arrive in one stream, so each file is matched back to the
// source whose folder it came out of rather than to "the source", which would be a guess.
const byFolder = {};
for (const s of $('Load sources').all().map((i) => i.json)) {
  if (s.type === 'markdown') byFolder[String(s.address).replace(/\/+$/, '')] = s;
}
const onlySource = Object.values(byFolder)[0] || {};

const SKIP = /(^|\/)README\.md$/i;   // the corpus's own note to the reader is not documentation

const out = [];
for (let i = 0; i < texts.length; i++) {
  const meta = files[i] ? (files[i].binary || {}).data || files[i].json : {};
  const name = meta.fileName || `file-${i}.md`;
  const dir = (meta.directory || onlySource.address || '').replace(/\/+$/, '');
  const source = byFolder[dir] || onlySource;
  const text = String(texts[i].json.content || '');
  if (SKIP.test(name) || !text.trim()) continue;

  out.push({
    json: {
      source_id: source.source_id,
      source_name: source.name,
      // Relative to the folder, so the same document keeps its identity if the mount point changes.
      doc_url: `${dir.split('/').pop()}/${name}`,
      doc_path: `${dir}/${name}`,
      doc_title: (text.match(/^#\s+(.*)$/m) || [])[1] || name.replace(/\.md$/i, ''),
      text,
    },
  });
}

return out;
