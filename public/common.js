// What every view shares: which data set to open, the links a view names, and what a process is called.

// The data set named by ?data=, else the server's default run, else the only data file there is.
export async function loadData(params) {
  let name = params.get('data');
  if (!name) { try { name = (await (await fetch('data/index.json', { cache: 'no-store' })).json()).default; } catch { name = null; } }
  if (!name) throw new Error('No data to show: open a run with node serve.mjs --run <run folder>.');
  const response = await fetch(`data/${encodeURIComponent(name)}.json?ts=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`There is no data set called ${name}.`);
  return { name, data: await response.json() };
}

// The links a view shows: the run's own (its viewer.json), then this viewer and the Meaning Model.
export const VIEWER = { label: 'This view', url: 'https://github.com/emergent-wisdom/meaning-model-viewer' };
export const TOOL = { label: 'The tool', url: 'https://github.com/emergent-wisdom/meaning-model' };
export const linksOf = (data) => [...(data.display?.links ?? []).filter((link) => /^https?:\/\//.test(link.url ?? '')), VIEWER, TOOL]
  .filter((link, i, all) => all.findIndex((other) => other.url === link.url) === i);
export function fillLinks(element, data) {
  if (!element) return;
  element.replaceChildren();
  for (const link of linksOf(data)) {
    const label = document.createElement('span'); label.textContent = link.label;
    const anchor = document.createElement('a'); anchor.href = link.url; anchor.textContent = link.url.replace(/^https?:\/\//, ''); element.append(label, anchor);
  }
}

// A process's name: the run's own name for it (display.names in viewer.json), else its id as words, without the first
// name of the person it belongs to.
export function processLabel(data, id) {
  if (data.display?.names?.[id]) return data.display.names[id];
  const parts = String(id).split('.'); const firstNames = new Set((data.people ?? []).map((person) => String(person.name ?? '').split(' ')[0].toLowerCase()));
  return (parts.length > 1 && firstNames.has(parts[0].toLowerCase()) ? parts.slice(1) : parts).join(' ').replace(/_/g, ' ');
}

// Whose a lens reading is, in words: the holder it sits beneath, or that the model does not say.
export function holderText(reading, people = []) {
  const person = (id) => people.find((item) => item.id === id)?.name ?? String(id ?? '').split('.').at(-1);
  if (reading.perspective === 'actor') return `${person(reading.holder)}'s own reasons, as canon`;
  if (reading.perspective === 'reader') return `${person(reading.holder)}'s reading`;
  if (reading.holder) return reading.placed ? `read by ${reading.holder}` : `read by ${reading.holder}, kept on the record it reads`;
  return 'whose reading this is, the model does not say';
}
