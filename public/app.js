// Story Mind: one view of a Meaning Model story as it is built. Everything drawn comes from the data file the extractor
// writes: the model's lives, Events and Cuts in story time, the Understanding graph, and the construction in real time.
(async function main() {
  const params = new URLSearchParams(location.search);
  const dataName = params.get('data') ?? 'crossing-season';
  const live = params.has('live');
  const css = getComputedStyle(document.querySelector('.viz-root'));
  const token = (name) => css.getPropertyValue(name).trim();
  const HUES = [token('--series-1'), token('--series-2'), token('--series-3')];
  const OTHER = token('--other');
  const tooltip = document.getElementById('tooltip');

  let data = await load();
  if (!data) return;
  let tau = Infinity;               // construction clock: what exists so far
  let playhead = null;              // story clock: the moment the lanes' state cards describe
  let zoom = params.get('zoom') ?? 'lives';
  let playing = false;
  let userPlayhead = false;
  const seen = new Set();           // records already drawn, so a new one can arrive with a glow

  async function load() {
    try {
      const response = await fetch(`data/${dataName}.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status}`);
      return await response.json();
    } catch (error) {
      document.getElementById('caption-text').textContent = `No data yet (${dataName}): ${error.message}`;
      return null;
    }
  }

  // ---- helpers -----------------------------------------------------------------------------------------------------
  const ms = (born) => (born?.at ? Date.parse(born.at) : -Infinity);
  const visible = (born) => ms(born) <= tau;
  // The principals, or while the model is young anyone who already has a life.
  const principals = () => {
    const chosen = data.people.filter((person) => person.principal);
    for (const person of data.people) if (chosen.length < 3 && !chosen.includes(person) && person.life) chosen.push(person);
    return chosen.slice(0, 3);
  };
  const colorOf = (personId) => { const index = principals().findIndex((person) => person.id === personId); return index >= 0 ? HUES[index] : OTHER; };
  const fmtYear = (t, fine) => {
    if (t === null || t === undefined || Number.isNaN(t)) return '';
    if (t < 0) return `${Math.round(-t).toLocaleString()} BCE`;
    if (!fine) return `${Math.floor(t)}`;
    const year = Math.floor(t); const date = new Date(Date.UTC(year, 0, 1) + (t - year) * 365.2425 * 86400000);
    return date.toISOString().slice(0, 10);
  };
  const clip = (text, length) => { const value = String(text ?? ''); return value.length > length ? `${value.slice(0, length - 1)}…` : value; };
  const topOf = (answers) => (answers ?? [])[0] ?? null;
  function showTip(event, rows) {
    tooltip.replaceChildren(...rows.map(([text, cls]) => { const line = document.createElement('div'); if (cls) line.className = cls; line.textContent = text; return line; }));
    tooltip.hidden = false;
    const x = Math.min(event.clientX + 14, innerWidth - tooltip.offsetWidth - 10);
    const y = Math.min(event.clientY + 14, innerHeight - tooltip.offsetHeight - 10);
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
  }
  const hideTip = () => { tooltip.hidden = true; };
  const glow = (selection, key) => selection.each(function mark() { const id = key(d3.select(this).datum()); if (!seen.has(id)) { seen.add(id); if (tau !== Infinity) this.classList.add('born'); } });

  // ---- header ---------------------------------------------------------------------------------------------------------
  function renderHeader() {
    document.getElementById('title').textContent = data.title ?? 'Story Mind';
    const lives = principals().map((person) => person.name).join(', ');
    document.getElementById('subtitle').textContent = lives ? `${lives}. Every line below is the model's own record, drawn as it was built.` : '';
    const events = data.events.filter((event) => visible(event.born)).length;
    const cuts = data.people.flatMap((person) => [...person.series.flatMap((series) => series.points), ...person.decisions]).filter((item) => visible(item.born)).length;
    const nodes = data.graph.nodes.filter((node) => visible(node.born));
    const words = nodes.reduce((sum, node) => sum + node.words, 0);
    const tiles = [['Events', events], ['Cuts', cuts], ['Lives', data.people.filter((person) => person.life && visible(person.life.born)).length],
      ['Thoughts', nodes.filter((node) => node.category !== 'passage').length], ['Words of prose', words]];
    const root = document.getElementById('stats');
    root.replaceChildren(...tiles.map(([name, value]) => {
      const tile = document.createElement('div'); tile.className = 'stat';
      const v = document.createElement('div'); v.className = 'value'; v.textContent = value.toLocaleString();
      const n = document.createElement('div'); n.className = 'name'; n.textContent = name;
      tile.append(v, n); return tile;
    }));
  }

  // ---- deep time --------------------------------------------------------------------------------------------------------------
  function storyDomain() {
    const window = data.window ?? data.extent;
    if (zoom === 'lives') {
      const starts = principals().map((person) => person.life?.start).filter((t) => t !== null && t !== undefined);
      return [Math.min(...starts, window.start), window.end];
    }
    const pad = Math.max((window.end - window.start) * 0.04, 0.02);
    return [window.start - pad, window.end + pad];
  }
  function renderDeep() {
    const svg = d3.select('#deep'); const { width } = svg.node().getBoundingClientRect(); const height = 64;
    svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
    const present = data.window?.end ?? data.extent.end;
    const oldest = Math.min(data.extent.start, present - 10);
    const maxU = Math.log10(1 + present - oldest);
    const x = (t) => 16 + (1 - Math.log10(1 + Math.max(0, present - t)) / maxU) * (width - 32);
    const ages = [1, 10, 100, 1000, 10000, 100000, 1000000].filter((age) => age <= present - oldest);
    const axis = svg.append('g').attr('class', 'axis');
    for (const age of ages) {
      axis.append('line').attr('x1', x(present - age)).attr('x2', x(present - age)).attr('y1', 8).attr('y2', height - 16).attr('stroke', token('--grid'));
      axis.append('text').attr('x', x(present - age)).attr('y', height - 3).attr('text-anchor', 'middle').text(age >= 1000 ? `${age / 1000}k years` : `${age} ${age === 1 ? 'year' : 'years'}`);
    }
    // The long developments: the Events that last longer than a year, stacked by length.
    const long = data.events.filter((event) => event.start !== null && event.end !== null && event.span > 1 && visible(event.born))
      .sort((a, b) => b.span - a.span).slice(0, 60);
    const rows = [];
    for (const event of long) {
      const x0 = x(event.start); const x1 = Math.max(x0 + 2, x(event.end));
      let row = rows.findIndex((last) => last < x0 - 2); if (row < 0) { rows.push(0); row = rows.length - 1; }
      if (row > 5) continue;
      rows[row] = x1;
      const owner = data.people.find((person) => person.life?.eventId === event.id || person.periods.some((period) => period.eventId === event.id));
      svg.append('rect').datum(event).attr('x', x0).attr('y', 8 + row * 7).attr('width', x1 - x0).attr('height', 5).attr('rx', 2)
        .attr('fill', owner ? colorOf(owner.id) : token('--text-muted')).attr('opacity', owner ? 0.85 : 0.5)
        .on('pointermove', (e, d) => showTip(e, [[d.label, 't-value'], [`${fmtYear(d.start)} to ${fmtYear(d.end)}`, 't-muted'], [clip(d.description, 240)]])).on('pointerleave', hideTip);
    }
    const [d0, d1] = storyDomain();
    svg.append('rect').attr('x', x(d0)).attr('y', 4).attr('width', Math.max(4, x(d1) - x(d0))).attr('height', height - 18).attr('rx', 4)
      .attr('fill', 'none').attr('stroke', token('--text-secondary')).attr('stroke-width', 1.5);
  }

  // ---- lives ------------------------------------------------------------------------------------------------------------------
  function stateAt(person, t) {
    const period = person.periods.find((item) => item.start <= t && (item.end ?? Infinity) >= t && visible(item.born));
    const latest = person.series.map((series) => series.points.filter((point) => point.t <= t && visible(point.born)).at(-1)).filter(Boolean).sort((a, b) => b.t - a.t)[0];
    const shock = person.arcs.filter((arc) => arc.focal !== null && arc.focal <= t && (arc.adaptationEnd ?? Infinity) >= t && visible(arc.born)).at(-1);
    const age = person.life?.start !== null && person.life?.start !== undefined ? Math.floor(t - person.life.start) : null;
    return { period, latest, shock, age };
  }
  function portrait(group, person, size, state) {
    const hue = colorOf(person.id); const r = size / 2;
    const hash = (text) => [...String(text)].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
    group.append('circle').attr('r', r).attr('fill', token('--surface-2'));
    const processes = person.processes.length ? person.processes : Array.from({ length: 9 }, (_, i) => ({ eventId: `p${i}`, opened: 0 }));
    processes.forEach((process, i) => {
      const angle = (i / processes.length) * Math.PI * 2 - Math.PI / 2;
      const reach = r * (0.45 + Math.min(0.5, Math.log1p(process.opened) / 6));
      const spread = (Math.PI / processes.length) * 0.8;
      const path = d3.path();
      path.moveTo(0, 0);
      path.quadraticCurveTo(Math.cos(angle - spread) * reach * 0.9, Math.sin(angle - spread) * reach * 0.9, Math.cos(angle) * reach, Math.sin(angle) * reach);
      path.quadraticCurveTo(Math.cos(angle + spread) * reach * 0.9, Math.sin(angle + spread) * reach * 0.9, 0, 0);
      group.append('path').attr('d', path.toString()).attr('fill', hue).attr('opacity', process.opened ? 0.75 : 0.25);
    });
    for (const arc of person.arcs.filter((item) => visible(item.born))) {
      const angle = (hash(arc.eventId) % 360) * Math.PI / 180;
      group.append('line').attr('x1', Math.cos(angle) * r * 0.2).attr('y1', Math.sin(angle) * r * 0.2).attr('x2', Math.cos(angle) * r * 0.98).attr('y2', Math.sin(angle) * r * 0.98)
        .attr('stroke', token('--page')).attr('stroke-width', 1.5);
    }
    const weight = topOf(state?.latest?.answers)?.weight ?? 0.3;
    group.append('circle').attr('r', r * (0.14 + weight * 0.16)).attr('fill', token('--text-primary')).attr('opacity', 0.55 + weight * 0.45);
    group.append('circle').attr('r', r).attr('fill', 'none').attr('stroke', hue).attr('stroke-width', 1.5).attr('opacity', 0.8);
  }
  function renderLanes() {
    const host = document.getElementById('lanes');
    const { width, height } = host.getBoundingClientRect();
    const svg = d3.select(host).selectAll('svg').data([0]).join('svg').attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const people = principals().filter((person) => visible(person.born) || visible(person.life?.born));
    const gutter = 230; const axisH = 24; const laneH = (height - axisH - 6) / Math.max(1, people.length);
    const x = d3.scaleLinear().domain(storyDomain()).range([gutter, width - 14]);
    const fine = (x.domain()[1] - x.domain()[0]) < 6;
    if (playhead === null || playhead < x.domain()[0] || playhead > x.domain()[1]) playhead = x.domain()[1] - (x.domain()[1] - x.domain()[0]) * 0.04;
    document.getElementById('playhead-label').textContent = `state at ${fmtYear(playhead, true)}`;
    const axis = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - axisH})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor((width - gutter) / 110))).tickFormat((t) => fmtYear(t, fine)).tickSizeOuter(0));
    axis.select('.domain').attr('stroke', token('--axis'));
    people.forEach((person, laneIndex) => {
      const top = laneIndex * laneH; const mid = top + laneH * 0.62; const hue = colorOf(person.id);
      const lane = svg.append('g');
      lane.append('line').attr('x1', gutter).attr('x2', width - 14).attr('y1', top + laneH - 1).attr('y2', top + laneH - 1).attr('stroke', token('--grid'));
      // The person, as the model knows them at the playhead.
      const state = stateAt(person, playhead);
      portrait(lane.append('g').attr('transform', `translate(34,${top + laneH / 2})`), person, Math.min(52, laneH - 16), state);
      lane.append('text').attr('class', 'lane-name').attr('x', 68).attr('y', top + laneH / 2 - 12).text(clip(person.name, 22));
      lane.append('text').attr('class', 'lane-sub').attr('x', 68).attr('y', top + laneH / 2 + 4).text(state.age !== null ? `age ${state.age}${state.period ? ` · ${clip(state.period.what, 26)}` : ''}` : '');
      const top1 = topOf(state.latest?.answers);
      lane.append('text').attr('class', 'lane-state').attr('x', 68).attr('y', top + laneH / 2 + 20)
        .text(top1 ? `${clip(top1.key.replace(/[_.-]+/g, ' '), 22)} ${Math.round(top1.weight * 100)}%` : state.shock ? `after ${clip(state.shock.what, 24)}` : '');
      // Life, periods and shocks.
      if (person.life && visible(person.life.born)) lane.append('rect').attr('x', x(Math.max(person.life.start, x.domain()[0]))).attr('y', mid - 1.5)
        .attr('width', Math.max(0, x(Math.min(person.life.end ?? x.domain()[1], x.domain()[1])) - x(Math.max(person.life.start, x.domain()[0])))).attr('height', 3).attr('rx', 1.5).attr('fill', hue).attr('opacity', 0.45);
      person.periods.filter((period) => visible(period.born) && period.end > x.domain()[0] && period.start < x.domain()[1]).forEach((period, i) => {
        const x0 = x(Math.max(period.start, x.domain()[0])); const x1 = x(Math.min(period.end, x.domain()[1]));
        const band = lane.append('rect').datum(period).attr('x', x0).attr('y', mid + 8).attr('width', Math.max(1, x1 - x0 - 2)).attr('height', 14).attr('rx', 3)
          .attr('fill', hue).attr('opacity', i % 2 ? 0.16 : 0.26)
          .on('pointermove', (e, d) => showTip(e, [[d.what, 't-value'], [`${fmtYear(d.start, fine)} to ${fmtYear(d.end, fine)}`, 't-muted']])).on('pointerleave', hideTip);
        glow(band, (d) => d.eventId);
        if (x1 - x0 > 90) lane.append('text').attr('class', 'mark-label').attr('x', x0 + 6).attr('y', mid + 19).text(clip(period.what, Math.floor((x1 - x0) / 7)));
      });
      person.arcs.filter((arc) => visible(arc.born) && arc.focal !== null && arc.focal >= x.domain()[0] && arc.focal <= x.domain()[1]).forEach((arc) => {
        const at = x(arc.focal); const after = x(Math.min(arc.adaptationEnd ?? arc.focal, x.domain()[1]));
        const shock = lane.append('g').datum(arc)
          .on('pointermove', (e, d) => showTip(e, [['Shock', 't-muted'], [d.what, 't-value'], [`from ${fmtYear(d.focal, fine)}, adapting to ${fmtYear(d.adaptationEnd, fine)}`, 't-muted']])).on('pointerleave', hideTip);
        shock.append('rect').attr('x', at).attr('y', mid - 5).attr('width', Math.max(0, after - at)).attr('height', 10).attr('fill', hue).attr('opacity', 0.12);
        shock.append('path').attr('d', d3.symbol(d3.symbolTriangle, 70)()).attr('transform', `translate(${at},${mid - 11}) rotate(180)`).attr('fill', hue);
        glow(shock, (d) => d.eventId);
      });
      // What they want and feel, Cut by Cut; the main series as a line of one answer's share.
      const main = person.series[0];
      const pointsIn = (series) => series.points.filter((point) => visible(point.born) && point.t >= x.domain()[0] && point.t <= x.domain()[1]);
      const band = { top: top + 8, bottom: mid - 16 };
      const y = d3.scaleLinear().domain([0, 1]).range([band.bottom, band.top]);
      if (main) {
        const counts = new Map(); for (const point of main.points) { const key = topOf(point.answers)?.key; if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
        const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const shown = pointsIn(main);
        if (key && shown.length > 1) {
          const share = (point) => point.answers.find((answer) => answer.key === key)?.weight ?? 0;
          lane.append('path').datum(shown).attr('fill', hue).attr('opacity', 0.1)
            .attr('d', d3.area().x((p) => x(p.t)).y0(band.bottom).y1((p) => y(share(p))).curve(d3.curveMonotoneX));
          lane.append('path').datum(shown).attr('fill', 'none').attr('stroke', hue).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
            .attr('d', d3.line().x((p) => x(p.t)).y((p) => y(share(p))).curve(d3.curveMonotoneX));
          const last = shown.at(-1);
          lane.append('text').attr('class', 'mark-label').attr('x', Math.min(x(last.t) + 6, width - 120)).attr('y', y(share(last)) - 6).text(`${clip(key.replace(/[_.-]+/g, ' '), 18)} ${Math.round(share(last) * 100)}%`);
        }
      }
      for (const series of person.series) {
        const dots = lane.selectAll(null).data(pointsIn(series)).join('circle')
          .attr('cx', (p) => x(p.t)).attr('cy', (p) => y(topOf(p.answers)?.weight ?? 0)).attr('r', 4.5).attr('fill', hue)
          .attr('stroke', token('--surface-1')).attr('stroke-width', 2)
          .on('pointermove', (e, p) => showTip(e, [[series.question, 't-value'], [fmtYear(p.t, true), 't-muted'], ...p.answers.slice(0, 5).map((answer) => [`${Math.round(answer.weight * 100)}%  ${answer.key.replace(/[_.-]+/g, ' ')}`])]))
          .on('pointerleave', hideTip);
        glow(dots, (p) => p.cutId);
      }
      // Decisions, drawn by the model.
      const choices = lane.selectAll(null).data(person.decisions.filter((item) => visible(item.born) && item.t !== null && item.t >= x.domain()[0] && item.t <= x.domain()[1])).join('g')
        .attr('transform', (item) => `translate(${x(item.t)},${mid})`)
        .on('pointermove', (e, item) => showTip(e, [[item.question, 't-value'], [fmtYear(item.t, true), 't-muted'], ...item.answers.slice(0, 5).map((answer) => [`${Math.round(answer.weight * 100)}%  ${answer.key.replace(/[_.-]+/g, ' ')}${item.drawn?.realized === answer.key ? '  ← drawn' : ''}`])]))
        .on('pointerleave', hideTip);
      choices.append('path').attr('d', d3.symbol(d3.symbolDiamond, 110)()).attr('fill', (item) => (item.drawn ? hue : token('--surface-1'))).attr('stroke', hue).attr('stroke-width', 2);
      choices.filter((item) => item.drawn).append('text').attr('class', 'mark-label').attr('y', -10).attr('text-anchor', 'middle').text((item) => clip(item.drawn.realized.replace(/[_.-]+/g, ' '), 18));
      glow(choices, (item) => item.cutId);
    });
    // The playhead, draggable across the lanes.
    const line = svg.append('g').attr('transform', `translate(${x(playhead)},0)`);
    line.append('line').attr('y1', 0).attr('y2', height - axisH).attr('stroke', token('--text-secondary')).attr('stroke-width', 1);
    svg.append('rect').attr('x', gutter).attr('y', 0).attr('width', width - gutter - 14).attr('height', height - axisH).attr('fill', 'transparent')
      .style('cursor', 'ew-resize').lower()
      .on('pointerdown pointermove', (e) => { if (e.buttons !== 1) return; playhead = x.invert(d3.pointer(e)[0]); userPlayhead = true; renderLanes(); });
    host.__x = x;
  }

  // ---- the mind ------------------------------------------------------------------------------------------------------------------
  const SHAPES = { thought: d3.symbolCircle, world: d3.symbolStar, director: d3.symbolTriangle, draw: d3.symbolDiamond, passage: d3.symbolSquare, author: d3.symbolWye, reference: d3.symbolCross, review: d3.symbolTriangle, other: d3.symbolCircle };
  const NAMES = { thought: 'Thought', world: 'World stage', director: 'Director', draw: 'Drawn decision', passage: 'Prose', author: 'Author record', reference: 'Other model', review: 'Review', other: 'Other' };
  const mind = { simulation: null, nodes: new Map(), links: [] };
  const personOfEvent = new Map();
  function indexPeople() {
    personOfEvent.clear();
    for (const person of data.people) {
      if (person.life) personOfEvent.set(person.life.eventId, person.id);
      for (const item of [...person.periods, ...person.arcs]) personOfEvent.set(item.eventId, person.id);
      for (const series of person.series) for (const point of series.points) personOfEvent.set(point.eventId, person.id);
      for (const item of person.decisions) personOfEvent.set(item.eventId, person.id);
    }
    for (const event of data.events) if (!personOfEvent.has(event.id)) { const owner = event.participants.find((id) => data.people.some((person) => person.id === id)); if (owner) personOfEvent.set(event.id, owner); }
  }
  function renderLegend() {
    const categories = [...new Set(data.graph.nodes.map((node) => node.category))];
    const root = document.getElementById('mind-legend');
    root.replaceChildren(...categories.map((category) => {
      const item = document.createElement('span');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', 12); svg.setAttribute('height', 12);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d3.symbol(SHAPES[category], 60)()); path.setAttribute('transform', 'translate(6,6)'); path.setAttribute('fill', token('--text-secondary'));
      svg.append(path); item.append(svg, document.createTextNode(NAMES[category] ?? category)); return item;
    }), ...principals().map((person, i) => { const item = document.createElement('span'); const dot = document.createElement('i'); dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${HUES[i]}`; item.append(dot, document.createTextNode(person.name)); return item; }));
  }
  function renderMind() {
    const svg = d3.select('#mind'); const { width, height } = svg.node().getBoundingClientRect();
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const hubs = principals().map((person, i) => ({ id: `person:${person.id}`, kind: 'person', person, fx: width * (0.25 + 0.25 * i), fy: height * 0.5 }));
    const nodes = data.graph.nodes.filter((node) => visible(node.born)).map((node) => ({ ...node, kind: 'node' }));
    const byId = new Map([...hubs, ...nodes].map((node) => [node.id, node]));
    const links = []; const tone = new Map();
    for (const edge of data.graph.edges) {
      if (!visible(edge.born) || !byId.has(edge.source)) continue;
      let target = edge.target.node ?? null;
      if (edge.target.anchor) { const owner = personOfEvent.get(edge.target.anchor) ?? (data.people.some((person) => person.id === edge.target.anchor) ? edge.target.anchor : null); target = owner ? `person:${owner}` : null; if (owner && !tone.has(edge.source)) tone.set(edge.source, owner); }
      if (target && byId.has(target) && target !== edge.source) links.push({ source: edge.source, target });
    }
    // Carry over positions so the graph grows instead of reshuffling.
    for (const node of [...hubs, ...nodes]) { const old = mind.nodes.get(node.id); if (old) { node.x = old.x; node.y = old.y; node.vx = old.vx; node.vy = old.vy; } else if (node.kind === 'node') { node.x = width / 2 + (Math.random() - 0.5) * 60; node.y = height / 2 + (Math.random() - 0.5) * 60; } }
    mind.nodes = byId;
    const all = [...hubs, ...nodes];
    if (!mind.simulation) mind.simulation = d3.forceSimulation().force('charge', d3.forceManyBody().strength(-42)).force('collide', d3.forceCollide(10)).on('tick', tick);
    mind.simulation.force('x', d3.forceX(width / 2).strength(0.04)).force('y', d3.forceY(height / 2).strength(0.07));
    mind.size = { width, height };
    mind.simulation.nodes(all).force('link', d3.forceLink(links).id((node) => node.id).distance(46).strength(0.35)).alpha(0.6).restart();
    const linkLayer = svg.selectAll('g.links').data([0]).join('g').attr('class', 'links');
    const nodeLayer = svg.selectAll('g.nodes').data([0]).join('g').attr('class', 'nodes');
    linkLayer.selectAll('line').data(links, (link) => `${link.source.id ?? link.source}>${link.target.id ?? link.target}`).join('line').attr('stroke', token('--axis')).attr('stroke-width', 1);
    const drawn = nodeLayer.selectAll('g.n').data(all, (node) => node.id).join((enter) => {
      const group = enter.append('g').attr('class', 'n');
      group.filter((node) => node.kind === 'person').append('circle').attr('r', 16).attr('fill', (node) => colorOf(node.person.id)).attr('stroke', token('--surface-1')).attr('stroke-width', 2);
      group.filter((node) => node.kind === 'person').append('text').attr('class', 'lane-name').attr('y', 30).attr('text-anchor', 'middle').text((node) => node.person.name.split(' ')[0]);
      group.filter((node) => node.kind === 'node').append('path').attr('d', (node) => d3.symbol(SHAPES[node.category] ?? d3.symbolCircle, node.category === 'passage' ? 120 : 64)())
        .attr('fill', (node) => (tone.has(node.id) ? colorOf(tone.get(node.id)) : token('--text-secondary'))).attr('stroke', token('--surface-1')).attr('stroke-width', 2);
      return group;
    });
    drawn.on('pointermove', (e, node) => node.kind === 'person' ? showTip(e, [[node.person.name, 't-value'], [clip(node.person.who, 260), 't-muted']])
      : showTip(e, [[NAMES[node.category] ?? node.category, 't-muted'], [node.title || clip(node.text, 90), 't-value'], [clip(node.text, 420)]])).on('pointerleave', hideTip)
      .on('click', (e, node) => { if (node.kind === 'node') caption(NAMES[node.category] ?? node.category, node.text); });
    glow(drawn, (node) => node.id);
    function tick() {
      const pad = 12; const { width, height } = mind.size;
      for (const node of mind.simulation.nodes()) { node.x = Math.max(pad, Math.min(width - pad, node.x)); node.y = Math.max(pad, Math.min(height - pad, node.y)); }
      linkLayer.selectAll('line').attr('x1', (link) => link.source.x).attr('y1', (link) => link.source.y).attr('x2', (link) => link.target.x).attr('y2', (link) => link.target.y);
      nodeLayer.selectAll('g.n').attr('transform', (node) => `translate(${node.x},${node.y})`);
    }
  }

  // ---- caption and construction -----------------------------------------------------------------------------------------------------
  function caption(kind, text) {
    document.getElementById('caption-kind').textContent = kind;
    document.getElementById('caption-text').textContent = clip(text, 420);
  }
  function currentCaption() {
    const newest = data.graph.nodes.filter((node) => visible(node.born) && node.born?.at).sort((a, b) => ms(b.born) - ms(a.born))[0];
    const step = data.steps.filter((item) => item.kind === 'graph' && Date.parse(item.at) <= tau && item.label).at(-1);
    if (newest?.category === 'passage' && (!step || ms(newest.born) >= Date.parse(step.at))) return caption('Prose', newest.text);
    if (newest && ['thought', 'director', 'world'].includes(newest.category) && (!step || ms(newest.born) >= Date.parse(step.at))) return caption(NAMES[newest.category], newest.text);
    if (step) return caption('The agent', step.label);
    caption('What the agent is doing', data.steps.at(-1)?.label ?? '');
  }
  function renderBuild() {
    const svg = d3.select('#build'); const { width } = svg.node().getBoundingClientRect(); const height = 112;
    svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
    const times = data.steps.map((step) => Date.parse(step.at)).filter(Number.isFinite);
    if (!times.length) return;
    const t0 = Math.min(...times); const t1 = Math.max(...times, t0 + 60000);
    const active = activeClock(times);
    const lin = d3.scaleLinear().domain([0, active(t1)]).range([40, width - 16]);
    const x = (t) => lin(active(t)); x.invert = (px) => active.invert(lin.invert(px));
    const model = data.steps.filter((step) => step.kind === 'model' && step.totals).map((step) => ({ t: Date.parse(step.at), events: step.totals.events }));
    const bornNodes = data.graph.nodes.filter((node) => node.born?.at).map((node) => Date.parse(node.born.at)).sort((a, b) => a - b);
    const graphCount = bornNodes.map((t, i) => ({ t, n: i + 1 }));
    const max = Math.max(1, ...model.map((point) => point.events), graphCount.length);
    const y = d3.scaleLinear().domain([0, max]).range([height - 20, 22]).nice();
    const ticks = d3.range(0, 7).map((i) => active.invert((active(t1) * i) / 6));
    const axisG = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - 20})`);
    axisG.append('line').attr('x1', 40).attr('x2', width - 16).attr('stroke', token('--axis'));
    axisG.selectAll('text').data(ticks).join('text').attr('x', (t) => x(t)).attr('y', 14).attr('text-anchor', 'middle').text((t) => new Date(t).toISOString().slice(11, 16) + ' UTC');
    svg.append('g').attr('class', 'axis').attr('transform', 'translate(40,0)').call(d3.axisLeft(y).ticks(3).tickSize(-(width - 56))).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('line').attr('stroke', token('--grid')));
    const stepLine = (points, key) => d3.line().x((p) => x(p.t)).y((p) => y(p[key])).curve(d3.curveStepAfter)(points);
    svg.append('path').attr('d', d3.area().x((p) => x(p.t)).y0(y(0)).y1((p) => y(p.events)).curve(d3.curveStepAfter)(model)).attr('fill', HUES[0]).attr('opacity', 0.1);
    svg.append('path').attr('d', stepLine(model, 'events')).attr('fill', 'none').attr('stroke', HUES[0]).attr('stroke-width', 2);
    svg.append('path').attr('d', stepLine(graphCount, 'n')).attr('fill', 'none').attr('stroke', token('--text-secondary')).attr('stroke-width', 2);
    const lastModel = model.at(-1); const lastGraph = graphCount.at(-1);
    if (lastModel) svg.append('text').attr('class', 'mark-label').attr('x', x(lastModel.t) - 4).attr('y', y(lastModel.events) - 6).attr('text-anchor', 'end').text(`${lastModel.events} Events in the model`);
    if (lastGraph) svg.append('text').attr('class', 'mark-label').attr('x', x(lastGraph.t) - 4).attr('y', y(lastGraph.n) - 6).attr('text-anchor', 'end').text(`${lastGraph.n} records of understanding and text`);
    // Milestones: world stages, the director, draws and prose.
    const milestones = data.graph.nodes.filter((node) => node.born?.at && ['world', 'director', 'draw', 'passage'].includes(node.category));
    svg.append('g').selectAll('path').data(milestones).join('path').attr('d', (node) => d3.symbol(SHAPES[node.category], 44)())
      .attr('transform', (node) => `translate(${x(Date.parse(node.born.at))},12)`).attr('fill', (node) => (node.category === 'passage' ? token('--text-primary') : token('--text-secondary')))
      .on('pointermove', (e, node) => showTip(e, [[NAMES[node.category], 't-muted'], [node.title || clip(node.text, 100), 't-value'], [new Date(Date.parse(node.born.at)).toISOString().slice(11, 19) + ' UTC', 't-muted']])).on('pointerleave', hideTip);
    const cursor = Number.isFinite(tau) ? Math.max(t0, Math.min(t1, tau)) : t1;
    svg.append('line').attr('x1', x(cursor)).attr('x2', x(cursor)).attr('y1', 16).attr('y2', height - 20).attr('stroke', token('--text-primary')).attr('stroke-width', 1.5);
    svg.append('rect').attr('x', 40).attr('y', 0).attr('width', width - 56).attr('height', height).attr('fill', 'transparent').style('cursor', 'pointer')
      .on('pointerdown pointermove', (e) => { if (e.type === 'pointermove' && e.buttons !== 1) return; stop(); setTau(x.invert(d3.pointer(e)[0])); });
    document.getElementById('clock').textContent = `${new Date(cursor).toISOString().slice(11, 19)} UTC · ${Math.round(active(cursor) / 60000)} minutes of work into the build`;
    svg.node().__range = [t0, t1];
  }

  // Working time: gaps longer than five minutes between calls count as one minute, so idle hours do not fill the axis.
  function activeClock(times) {
    const sorted = [...new Set(times)].sort((a, b) => a - b); const marks = [[sorted[0], 0]];
    for (let i = 1; i < sorted.length; i += 1) { const gap = sorted[i] - sorted[i - 1]; marks.push([sorted[i], marks[i - 1][1] + Math.min(gap, 60000 * (gap > 300000 ? 1 : 5))]); }
    const toActive = (t) => { if (t <= marks[0][0]) return 0; for (let i = 1; i < marks.length; i += 1) if (t <= marks[i][0]) { const [a, va] = marks[i - 1]; const [b, vb] = marks[i]; return va + ((t - a) / (b - a || 1)) * (vb - va); } return marks.at(-1)[1]; };
    toActive.invert = (v) => { if (v <= 0) return marks[0][0]; for (let i = 1; i < marks.length; i += 1) if (v <= marks[i][1]) { const [a, va] = marks[i - 1]; const [b, vb] = marks[i]; return a + ((v - va) / (vb - va || 1)) * (b - a); } return marks.at(-1)[0]; };
    return toActive;
  }

  // ---- the clocks --------------------------------------------------------------------------------------------------------------------
  function followStory() {
    if (userPlayhead) return;
    const domain = storyDomain();
    const newest = data.events.filter((event) => visible(event.born) && event.born?.at && event.start !== null && event.start >= domain[0] && event.start <= domain[1]).sort((a, b) => ms(b.born) - ms(a.born))[0];
    if (newest) playhead = newest.start;
  }
  function renderAll() { renderHeader(); renderDeep(); followStory(); renderLanes(); renderMind(); renderBuild(); currentCaption(); }
  function setTau(value) { tau = value; renderAll(); }
  let timer = null;
  function stop() { playing = false; clearInterval(timer); document.getElementById('play').textContent = '▶'; }
  function play() {
    const [t0, t1] = d3.select('#build').node().__range ?? [0, 0];
    if (!Number.isFinite(tau) || tau >= t1) { tau = t0; seen.clear(); }
    playing = true; userPlayhead = false; document.getElementById('play').textContent = '❚❚';
    const active = activeClock(data.steps.map((step) => Date.parse(step.at)).filter(Number.isFinite));
    const stepActive = active(t1) / (45000 / 120); // the whole build in about 45 seconds
    timer = setInterval(() => { if (tau >= t1) { stop(); tau = Infinity; renderAll(); return; } setTau(Math.min(t1, active.invert(active(tau) + stepActive))); }, 120);
  }
  document.getElementById('play').addEventListener('click', () => (playing ? stop() : play()));
  document.getElementById('zoom').addEventListener('click', (e) => { const button = e.target.closest('button'); if (!button) return; zoom = button.dataset.zoom; userPlayhead = false;
    for (const other of document.querySelectorAll('#zoom button')) other.classList.toggle('on', other === button); renderAll(); });
  addEventListener('resize', () => renderAll());

  indexPeople(); renderLegend();
  for (const node of data.graph.nodes) seen.add(node.id);
  renderAll();
  if (params.has('play')) setTimeout(play, 800);

  // Live: pick up the agent's newest work as the extractor refreshes the data file.
  if (live) {
    document.getElementById('live').hidden = false;
    setInterval(async () => {
      if (playing) return;
      const next = await load();
      if (next && next.lastCall !== data.lastCall) { data = next; indexPeople(); renderLegend(); renderAll(); }
    }, 15000);
  }
})();
