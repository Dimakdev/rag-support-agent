// [4b] The url adapter. A help centre page is mostly not the help: navigation, cookie banner, footer,
// "was this useful". What survives here is what the agent can ever cite, so the stripping is
// deliberate rather than a regex that removes all tags and hopes.
//
// This is not a browser. A page that renders its content with JavaScript arrives empty, and the run
// says so instead of indexing a shell.
const MAIN = /<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i;
const DROP = /<(script|style|nav|header|footer|aside|form|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

function decode(s) {
  return s.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()]
    ?? (/^&#\d+;$/.test(e) ? String.fromCharCode(Number(e.slice(2, -1))) : e));
}

// Headings become markdown headings on purpose: the chunker downstream cuts on them, so a page that
// was written with structure keeps it all the way into the citation.
function toMarkdown(html) {
  return decode(html
    .replace(DROP, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n\n${'#'.repeat(Number(l))} ${t.replace(/<[^>]+>/g, ' ').trim()}\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|tr|ul|ol|table)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The HTTP node answers one item per request in the order it was asked, and it replaces the item's
// json with the response — so the page is matched back to its source row by position. Every other
// way of carrying the source through an HTTP node in n8n is worse.
const urlSources = $('Load sources').all().map((i) => i.json).filter((s) => s.type === 'url');

const out = [];
const responses = $input.all();
for (let i = 0; i < responses.length; i++) {
  const item = responses[i];
  const source = urlSources[i] || {};
  const html = String(item.json.data ?? item.json.body ?? '');
  const inner = (html.match(MAIN) || [])[1] || html;
  const text = toMarkdown(inner);
  const title = decode(((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
    .replace(/<[^>]+>/g, ' ').trim());

  // 200 characters of prose is the line between a thin page and a page that did not render for us.
  if (text.length < 200) {
    out.push({ json: { source_id: source.source_id, doc_url: source.address, failed: true,
                       reason: `page gave ${text.length} characters of text; it may need JavaScript` } });
    continue;
  }

  out.push({
    json: {
      source_id: source.source_id,
      source_name: source.name,
      doc_url: source.address,
      doc_path: source.address,
      doc_title: title || source.name,
      text: text.startsWith('#') ? text : `# ${title || source.name}\n\n${text}`,
    },
  });
}

return out;
