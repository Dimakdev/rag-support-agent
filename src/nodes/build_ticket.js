// [B11] Every path that ends with a person comes through here: a question about someone's own
// account, an empty search, a low score, a citation that did not check out, a model that failed
// twice. The reason is recorded as a category rather than a sentence, because the distribution of
// reasons is the most useful number this system produces.
//
// nothing_found is not a defect in the agent. It is a hole in the documentation, and a week of those
// is a list of pages somebody should write.
const req = $input.first().json;
const ticket = `T-${Date.now().toString(36).slice(-5).toUpperCase()}`;

const found = (req.found || []).slice(0, 5);
const foundText = found.length
  ? found.map((f) => `${f.heading_path} (${f.doc_url}, ${f.score})`).join('\n')
  : 'nothing above the similarity threshold';

const REASON_TEXT = {
  always_human: 'about this customer\'s own account, money or legal position',
  nothing_found: 'nothing in the documents came close',
  low_confidence: 'the documents were close but did not answer it',
  citation_mismatch: 'the answer could not be backed by the documents it claimed',
  budget: 'the daily model budget was already spent',
  model_failed: 'the model failed twice in a row',
};

const reason = req.reason || 'nothing_found';

return [{
  json: {
    ...req,
    ticket,
    outcome: 'escalate',
    reason,
    ticket_body: {
      typecast: true,
      fields: {
        Ticket: ticket,
        Question: req.question,
        Reason: reason,
        Confidence: Math.round(Number(req.confidence || 0)),
        Found: [foundText, req.validation_detail ? `\n${req.validation_detail}` : ''].join(''),
        Status: 'New',
        Session: req.session_id,
        Created: new Date().toISOString(),
      },
    },
    // Telegram, in HTML: Markdown breaks on the first underscore in a url, which is a lesson from
    // the Lead -> CRM case rather than a guess.
    telegram_text: [
      `<b>${ticket}</b> — ${REASON_TEXT[reason] || reason}`,
      '',
      `<b>Question:</b> ${req.question.slice(0, 500)}`,
      found.length ? `<b>Closest:</b> ${found[0].heading_path} (${found[0].score})` : '',
      `<b>Session:</b> ${req.session_id}`,
    ].filter(Boolean).join('\n'),
  },
}];
