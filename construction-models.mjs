// Select the final graph's own model history; exported dependencies may follow it.
export function constructionModelHistory(history) {
  const models = new Map((history.models ?? []).map((entry) => [entry.modelHash, entry]));
  let boundModelHash = null;
  for (const revision of history.revisions ?? []) {
    const source = revision.definition?.source ?? revision.delta?.source;
    if (source) boundModelHash = source.kind === 'model' ? source.model_hash : null;
  }
  // Static inputs and older single-model exports need no dependency ordering.
  if (!boundModelHash && models.size === 1) boundModelHash = models.keys().next().value;
  const finalModelEntry = models.get(boundModelHash);
  if (!finalModelEntry) throw new Error('The final graph has no available bound model; dependency order cannot identify its model.');
  const modelHistory = [], seen = new Set();
  let entry = finalModelEntry;
  while (entry) {
    if (seen.has(entry.modelHash)) throw new Error('The bound model history contains a revision cycle.');
    seen.add(entry.modelHash); modelHistory.push(entry);
    // Static files can contain one revision without its earlier history.
    entry = models.get(entry.definition.revision?.previous_model_hash);
  }
  return { finalModelEntry, modelHistory: modelHistory.reverse() };
}
