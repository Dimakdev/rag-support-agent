// [B10] Both models failed on this question: a timeout, a refusal, an answer that did not fit the
// schema twice. The person still gets an answer — that it is going to a human — and the reason is
// recorded as model_failed rather than as "nothing found", because those are different problems with
// different fixes.
const ctx = $('Build context').first().json;
const err = $input.first().json || {};

return [{
  json: {
    ...ctx,
    outcome: 'escalate',
    reason: 'model_failed',
    confidence: 0,
    validation_detail: String(err.error?.message || err.message || 'both model attempts failed')
      .slice(0, 300),
  },
}];
