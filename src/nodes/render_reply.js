// [B13] The last node before the person. It writes the reply, the sources under it, and the row that
// lets the next turn of this conversation make sense.
//
// Links are attached here and nowhere earlier: the model never saw a url, so it cannot have invented
// one. Each source points at the sub-section its quote came from.
// This node is reached from three places, and one of them lies about what it is handing over: the
// Telegram node replaces the item with its own API response, so a ticket arrives here as
// {ok: true, result: {...}}. When the input does not look like a request, the real one is read back
// from the ticket node. The try/catch is not decoration — asking n8n for a node that did not run in
// this branch throws.
function fromTicket() {
  try {
    return $('Build ticket').first().json;
  } catch (e) {
    return null;
  }
}

const incoming = $input.first().json || {};
const r = incoming.session_id ? incoming : (fromTicket() || incoming);

const PHRASES = {
  en: {
    unknown: 'I don\'t know — the documents have nothing on that. I have passed it to a person, '
      + 'who will answer here. Reference {ticket}.',
    empty: 'Ask me something about the product and I will look it up in the documentation.',
    sources: 'Sources',
  },
  uk: {
    unknown: 'Не знаю — у документах про це нічого немає. '
      + 'Передав людині, вона відповість тут. Звернення {ticket}.',
    empty: 'Запитайте про продукт — пошукаю в документації.',
    sources: 'Джерела',
  },
};
const say = PHRASES[r.lang] || PHRASES.en;

let text;
if (r.empty) text = say.empty;
else if (r.outcome === 'answer') text = r.answer;
else if (r.outcome === 'clarify') text = r.clarify_question;
else text = say.unknown.replace('{ticket}', r.ticket || '');

const sources = (r.citations || []).map((c) => ({
  title: c.doc_title,
  section: c.section,
  url: c.doc_url,
  quote: c.quote,
}));

return [{
  json: {
    record_id: r.record_id,
    reply: {
      session_id: r.session_id,
      outcome: r.outcome || (r.empty ? 'clarify' : 'escalate'),
      answer: text,
      sources,
      ticket: r.ticket || null,
      confidence: r.confidence ?? null,
      // The eval harness reads these; a person never sees them.
      debug: r.is_eval ? { reason: r.reason || '', best_score: r.best_score ?? null,
                           found: r.found || [], quarantined_lines: r.quarantined_lines ?? 0 } : undefined,
    },
    // One upsert instead of a lookup and a write: Airtable merges on Session.
    conversation_body: {
      typecast: true,
      performUpsert: { fieldsToMergeOn: ['Session'] },
      records: [{
        fields: {
          Session: r.session_id,
          Channel: r.is_eval ? 'eval' : (r.channel || 'web'),
          Started: r.asked_at,
          Turns: r.turns || 1,
          'Last question': r.question,
          'Last outcome': r.outcome || 'clarify',
          'Last answer': text.slice(0, 5000),
          // Which documents this answer stood on. The next short reply in this session leans on
          // them, so "and monthly?" keeps talking about refunds instead of drifting into pricing.
          'Last sources': [...new Set(sources.map((s) => s.url))].join('\n'),
        },
      }],
    },
  },
}];
