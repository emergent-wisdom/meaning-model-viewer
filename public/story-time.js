// Reading order belongs to the render. World time comes only from declared depicts/renders links.
// A link identifies an Event depicted by the passage; it does not disclose every fact in that Event.
export function placeStoryUnits(units, edges, events) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const links = new Map();
  for (const edge of edges) {
    if (edge.relation !== 'renders' || edge.source?.kind !== 'node'
      || edge.target?.kind !== 'anchor' || edge.target.anchor_kind !== 'event') continue;
    const id = edge.source.node_id;
    if (!links.has(id)) links.set(id, new Set());
    links.get(id).add(edge.target.anchor_id);
  }
  return units.map((unit) => {
    const tells = [...(links.get(unit.id) ?? [])].map((eventId) => ({ eventId }));
    const spans = tells.flatMap(({ eventId }) => {
      const event = byId.get(eventId);
      return Number.isFinite(event?.start)
        ? [{ eventId, start: event.start, end: Number.isFinite(event.end) ? event.end : event.start }] : [];
    });
    return { ...unit, tells, spans, timing: spans.length ? 'declared' : tells.length ? 'undated' : 'unlinked',
      t: spans.length ? Math.min(...spans.map((span) => span.start)) : null,
      end: spans.length ? Math.max(...spans.map((span) => span.end)) : null };
  });
}

// Several passages can depict the same moment, and a later passage can visit an earlier one.
export function partsAtTime(units, time) {
  const spans = units.flatMap((unit, i) => (unit.spans ?? []).map((span) => ({ ...span, i })));
  const active = spans.filter((span) => span.start <= time && span.end >= time);
  const latest = Math.max(-Infinity, ...spans.filter((span) => span.start <= time).map((span) => span.start));
  return [...new Set((active.length ? active : spans.filter((span) => span.start === latest)).map((span) => span.i))];
}
