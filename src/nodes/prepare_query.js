// [B3] Two jobs, both before any money is spent.
//
// First, the one step of memory. If the last thing this session got was a clarifying question, the
// reply arriving now is an answer to it — "annual" on its own is not a question. The two are glued
// into one before the search, because "annual" retrieves nothing useful and "annual" plus the
// original question retrieves the right paragraph.
//
// Second, the questions that documents are not allowed to answer. Somebody asking why they were
// charged twelve dollars on the third is asking about their own account; the help centre has nothing
// to say about it, and a confident paragraph about the refund policy would be worse than silence.
const req = $('Open request').first().json;
const prev = ($input.first().json.records || [])[0];
const fields = prev ? prev.fields || {} : {};

// Two cases where the message on its own is not a question. After a clarifying question, obviously.
// But also when someone answers a full answer with one word — "annual", "the mobile one" — which is
// a continuation whatever the previous outcome was. Three words is the line: longer than that and
// people are asking something new.
const words = req.question.split(/\s+/).filter(Boolean).length;
const previous = String(fields['Last question'] || '');
const isFollowUp = previous
  && (fields['Last outcome'] === 'clarify' || (words > 0 && words <= 3));

let searchText = req.question;
if (isFollowUp) searchText = `${previous} ${req.question}`.trim().slice(0, 2000);
const carried = Boolean(isFollowUp);

// The search and the model need different shapes of the same thing. The search wants one string to
// embed; the model needs to see that this is a second turn, or it answers "and monthly?" as if it
// were the whole question — which it did, on the first try, with a confident answer about pricing.
const questionForModel = isFollowUp
  ? `They asked: ${previous}\nThey now say: ${req.question}\n\nAnswer what they are asking now, in the light of what they asked before.`
  : req.question;

let alwaysHuman = false;
if (req.settings.always_human) {
  try {
    alwaysHuman = new RegExp(req.settings.always_human, 'i').test(req.question);
  } catch (e) {
    // A broken pattern in the table must not take the agent down; it just stops filtering.
    alwaysHuman = false;
  }
}

return [{
  json: {
    ...req,
    record_id: prev ? prev.id : null,
    turns: Number(fields.Turns || 0) + 1,
    carried_context: carried,
    // Glueing two questions into one string makes the vector drift towards whatever both of them
    // mention — "refund on my annual plan" plus "and monthly?" lands in the pricing page. The
    // documents the last answer stood on are carried along as a thumb on the scale.
    pinned_docs: isFollowUp ? String(fields['Last sources'] || '').split('\n').filter(Boolean) : [],
    search_text: searchText,
    previous_question: isFollowUp ? previous : '',
    question_for_model: questionForModel,
    always_human: alwaysHuman,
    // Shape shared by every path that ends with a person: the ticket node reads only its input.
    ...(alwaysHuman ? { outcome: 'escalate', reason: 'always_human', confidence: 0, found: [] } : {}),
    // The embedding request for the search, ready to send.
    embed_body: {
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: searchText }] },
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 768,
    },
  },
}];
