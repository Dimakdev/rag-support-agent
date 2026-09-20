// [B9] The node the whole case exists for. The model has answered; this decides whether anyone is
// allowed to see it.
//
// Three checks, all of them code. None of them ask the model anything, because a model that made a
// citation up will confirm it just as fluently.
//   1. An answer must cite something.
//   2. Every cited id must be one that was actually put in front of it.
//   3. Every quote must appear, word for word, in that chunk's text.
// A failure is not a retry and not a silent fix: the answer is thrown away and the question goes to
// a human with the reason recorded.
const ctx = $('Build context').first().json;
const model = $input.first().json;

// chainLlm puts the parsed object under `output` when a structured parser is attached; some versions
// hand back the object itself. Both shapes are accepted rather than assumed.
const parsed = model.output ?? model.json ?? model;
const outcome = String(parsed.outcome || '').toLowerCase();
const citations = Array.isArray(parsed.citations) ? parsed.citations : [];
const confidence = Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0;

// A quote is looked for with flexible whitespace: a model that reflowed a line break has not made
// anything up, and failing it for that would be pedantry that costs real answers. The match returns
// the position IN THE ORIGINAL TEXT, because the section map is measured in original characters —
// comparing an index from the collapsed string against those offsets put one citation under the
// wrong heading before this was written this way.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function locate(text, quote) {
  const words = String(quote || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return -1;
  const m = new RegExp(words.map(escape).join('\\s+'), 'i').exec(String(text || ''));
  return m ? m.index : -1;
}

function verify() {
  if (outcome === 'clarify') return { ok: true };
  if (outcome === 'escalate') return { ok: true };
  if (!citations.length) return { ok: false, reason: 'citation_mismatch', detail: 'answered with no citation' };

  for (const c of citations) {
    const chunk = ctx.allowed[c.chunk_id];
    if (!chunk) {
      return { ok: false, reason: 'citation_mismatch',
               detail: `cited ${c.chunk_id}, which was not in the context` };
    }
    if (locate(chunk.text, c.quote) < 0) {
      return { ok: false, reason: 'citation_mismatch',
               detail: `quote not found in ${c.chunk_id}: ${String(c.quote).slice(0, 80)}` };
    }
  }
  if (confidence < ctx.settings.confidence) {
    return { ok: false, reason: 'low_confidence', detail: `confidence ${confidence} < ${ctx.settings.confidence}` };
  }
  return { ok: true };
}

const verdict = verify();

// Which sub-section each quote sits in. The chunker recorded where every merged section starts, so a
// citation points at "Refunds / Monthly plans", not at the page.
function sectionOf(chunk, quote) {
  const i = locate(chunk.text, quote);
  if (i < 0 || !chunk.sections.length) return chunk.heading_path;
  let found = chunk.sections[0];
  for (const s of chunk.sections) if (s.at <= i) found = s;
  return found.title || chunk.heading_path;
}

const final = verdict.ok ? (outcome || 'escalate') : 'escalate';
const clarifyText = final === 'clarify' ? String(parsed.answer || parsed.question || '').trim() : '';

// Tried here once: turning a short question that did find documents into a clarifying question
// instead of a ticket, on the theory that asking is cheaper than a person. It was measured and
// reverted. "What is your uptime SLA?" is five words and perfectly specific, and the rule turned an
// honest "we have nothing on that" into "did you mean security, billing or limits?", which is worse
// than useless. Word count cannot tell vague from absent; the model can, and does, most of the time.

return [{
  json: {
    ...ctx,
    outcome: final,
    answer: final === 'answer' ? String(parsed.answer || '').trim() : '',
    clarify_question: clarifyText,
    confidence,
    reason: verdict.ok ? (final === 'escalate' ? (parsed.reason || 'model_escalated') : '') : verdict.reason,
    validation_detail: verdict.detail || '',
    citations: final === 'answer' ? citations.map((c) => {
      const chunk = ctx.allowed[c.chunk_id];
      return {
        chunk_id: c.chunk_id,
        quote: c.quote,
        doc_url: chunk.doc_url,
        doc_title: chunk.doc_title,
        section: sectionOf(chunk, c.quote),
      };
    }) : [],
  },
}];
