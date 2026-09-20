// [9] Every chunk id in one item, so the "do you already have these" question costs one request
// instead of one per chunk. Qdrant answers an empty list with an empty result, so a pass where
// nothing changed needs no special case here.
const chunks = $input.all().map((i) => i.json).filter((c) => !c.is_state);
return [{ json: { ids: chunks.map((c) => c.chunk_id), chunk_count: chunks.length } }];
