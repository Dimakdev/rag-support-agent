// [2] The Sources table decides what gets read. This node turns its rows into one item per source and
// stops the run early when there is nothing active — an indexing pass over zero sources should be a
// quiet no-op, not a workflow that fails somewhere in the middle.
const rows = $input.first().json.records || [];

const sources = rows
  .map((r) => ({
    record_id: r.id,
    source_id: r.id,
    name: r.fields.Source || '(unnamed)',
    type: (r.fields.Type || 'markdown').trim(),
    address: String(r.fields.Address || '').trim().replace(/\/+$/, ''),
    status: r.fields.Status || 'Active',
    failures: Number(r.fields.Failures || 0),
  }))
  .filter((s) => s.status === 'Active' && s.address);

if (!sources.length) {
  return [{ json: { no_sources: true, started_at: new Date().toISOString() } }];
}

// One item per source; the Switch after this node sends each to the adapter its type names.
return sources.map((s) => ({ json: { ...s, started_at: new Date().toISOString() } }));
