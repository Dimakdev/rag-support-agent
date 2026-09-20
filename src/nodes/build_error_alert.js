// [E1] The error workflow. n8n hands it whatever crashed, in whichever branch, and it turns that
// into one line a person can act on without opening the editor.
//
// It exists because the two branches fail differently and both failures are quiet. A nightly index
// that dies at three in the morning leaves no one to tell; a question that dies mid-answer has
// already replied to the person by then. The execution id is the point of the message: it says where
// the data that caused it is still sitting.
const e = $input.first().json;
const wf = e.workflow || {};
const err = e.execution?.error || e.error || {};
const node = err.node?.name || e.execution?.lastNodeExecuted || 'unknown node';
const when = DateTime.now().toFormat('dd.MM HH:mm');

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const message = String(err.message || err.description || 'no message').slice(0, 400);

// Which half of the agent broke, in words rather than node names.
const branch = /index|chunk|embed|source|point/i.test(node) ? 'indexing'
  : /ask|answer|context|search|ticket|reply/i.test(node) ? 'answering'
    : 'unknown branch';

const text = [
  `<b>Support agent failed</b> — ${esc(branch)}`,
  '',
  `<b>Node:</b> ${esc(node)}`,
  `<b>Error:</b> ${esc(message)}`,
  `<b>When:</b> ${when}`,
  e.execution?.id ? `<b>Execution:</b> ${esc(e.execution.id)}` : '',
  e.execution?.url ? esc(e.execution.url) : '',
].filter(Boolean).join('\n');

return [{ json: { text, branch, node, message, workflow: wf.name || '' } }];
