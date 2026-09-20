// [B1] Everything the rest of the branch argues with lives in the Settings table, so it is read first
// and carried along. Nothing below this node has a number of its own.
const rows = ($input.first().json.records || []).map((r) => r.fields || {});
const raw = {};
for (const f of rows) if (f.Setting) raw[f.Setting] = String(f.Value ?? '').trim();

const num = (key, fallback) => {
  const v = Number(raw[key]);
  return Number.isFinite(v) ? v : fallback;
};

// Defaults match the seeded table. They exist so that a missing row degrades to sane behaviour
// instead of NaN spreading through the run.
const settings = {
  similarity: num('Similarity threshold', 0.55),
  confidence: num('Confidence threshold', 60),
  top_k: num('Top K', 12),
  context_chunks: num('Context chunks', 5),
  model: raw['Answer model'] || 'gemini-3.5-flash-lite',
  fallback_model: raw['Fallback model'] || 'gemini-3.5-flash',
  always_human: raw['Always human'] || '',
  cost_ceiling: num('Daily cost ceiling', 2),
  reply_language: raw['Reply language'] || 'match',
};

const body = $('Ask').first().json.body || {};
const question = String(body.question ?? body.text ?? '').trim().slice(0, 2000);
const sessionId = String(body.session_id ?? body.session ?? '').trim()
  || `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Cyrillic is the only script this corpus is likely to meet besides Latin; anything finer would be a
// language identifier, which this is not and does not claim to be.
const cyrillic = (question.match(/[Ѐ-ӿ]/g) || []).length;
const lang = settings.reply_language !== 'match' ? settings.reply_language
  : (cyrillic / Math.max(question.length, 1) > 0.2 ? 'uk' : 'en');

return [{
  json: {
    settings,
    session_id: sessionId,
    // Built here rather than in the URL: an Airtable formula is full of braces and quotes, and an
    // n8n expression is not the place to find out which of them need escaping.
    session_filter: encodeURIComponent(`{Session}='${sessionId.replace(/'/g, "\\'")}'`),
    channel: String(body.channel || 'web').slice(0, 20),
    is_eval: body.eval === true,
    question,
    lang,
    asked_at: new Date().toISOString(),
    // An empty question is answered here, without a lookup, an embedding or a model call.
    empty: question.length === 0,
  },
}];
