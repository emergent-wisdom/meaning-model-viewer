# Meaning Model Viewer

Open a [Meaning Model](https://github.com/emergent-wisdom/meaning-model) run and see what the agent built: the world,
the lives in it and how they change, modeled as events and processes over time. One command reads a run folder and
serves it in three views.

- **The explorer** shows the model's whole tree over time: the world, its long developments and the places and
  institutions in it, each person's life with its periods, change arcs and moments, and the processes they run
  through. It zooms continuously from a single day to the model's deep past, linear across a life and on a log scale
  of years before the present at the scale of world history. **Layers** stacks the tree level by level, each level a
  floor below and in front of the one that holds it; **Together** lays everything in one field. It starts with the top
  of the tree and its named processes, and adds the subsidiary processes, the events, the decisions, the causal links,
  the agent's notes, the prose and each lens's readings as you ask for them, down to the depth of the tree you choose.
- **The processes** shows every named process over the story's years as a curtain of light on its own scale, with the
  events that move them as threads, the decisions the model drew, the love-or-fear split behind the acts and the
  causal links between events. Press play to sweep through the years.
- **The landscape** shows every function of the model as terrain over time, the agent's notes and prose above it, and
  replays the construction in the order the agent built it.

The views were made for [*Twelve Words*](https://github.com/emergent-wisdom/story), the novel an agent wrote live
with the Meaning Model at the Stockholm Claude Community event of 25 September 2026. That repo holds its run, the book
and a video of the processes view.

## Open a run

It needs Node.js 22.18 or later.

```sh
git clone https://github.com/emergent-wisdom/meaning-model-viewer && cd meaning-model-viewer
npm install
npx meaning-model-mcp --install-engine
node serve.mjs --run <run folder>
```

Then open http://localhost:8765. The second line installs the published Meaning Model, which the viewer uses to read a
run; the third fetches its engine for your platform, once. To see *Twelve Words*:

```sh
git clone https://github.com/emergent-wisdom/story ../story
node serve.mjs --run ../story/runs/rabbit-hole
```

The title comes from the run's own story. A run is read once at the start; `--live` reads it again every minute while
an agent is still working, and the explorer or the landscape opened with `&live` follows it. `--run` can be given several times, and
`--port` (or `PORT`) sets the port. After a `--run`, these apply to that run:

| Flag | What it does |
| --- | --- |
| `--name <name>` | The name the views use for it in `?data=` (by default the folder's name). |
| `--title <title>` | A title of your own instead of the story's. |
| `--config <viewer.json>` | How to show it, when the run folder has no `viewer.json` of its own (see below). |
| `--log <file.jsonl>` | An earlier call log that comes first, such as the log of the run a fork was made from, so the construction replay reaches back to it. |
| `--graph <hash>` | The story graph to read, instead of the newest one the log names. |
| `--state <file.sqlite>` | The engine state, when the run folder holds more than one SQLite file. |

The viewer never writes into a run and never calls the run's own server: it reads the call log and an online backup of
the engine state, which is safe while the agent works. A run made with a Meaning Model newer than the published
package is read with that version: set `MEANING_MODEL_DIR` to its checkout (and `LIFE_SIM_ENGINE_BIN` to its engine
if it is not in `rust-engine/target/release`).

`node extract.mjs --run <run folder> --out <file.json>` makes a view's data file on its own, and
`node serve.mjs --data <folder>` serves a folder of such files.

## The run format: `meaning-model-run/1`

A run folder is what the Meaning Model's relay leaves while an agent works:

- `mcp-transcript.jsonl`, the relay's call log: one JSON object per line. The viewer reads the entries with
  `command.op` `"call"` and `event` `"result"`, each with `at` (an ISO time), `command.name` (the tool) and `result`
  (the tool's result, `content[0].text` holding its JSON). The newest story graph a write produced is the one shown,
  and each revision's time is the first logged call whose result names its hash.
- The engine's SQLite state: `engine-state.sqlite`, else `story-state.sqlite`, else the folder's only `.sqlite` file
  (or `--state`).
- `inputs/*.json`, the calls' arguments, if kept: the viewer takes the access scopes the agent wrote under from them
  and from the results.
- `viewer.json`, if the run says how it wants to be shown.

These can sit in the folder itself or in its `novel/` folder.

## How a run can ask to be shown: `viewer.json`

```json
{
  "schema": "meaning-model-viewer-display/1",
  "names": { "kieran.sharehouse_belonging": "belonging to the Sharehouse" },
  "order": ["kieran.sharehouse_belonging"],
  "links": [{ "label": "The story", "url": "https://github.com/emergent-wisdom/story" }]
}
```

`names` gives the processes names of their own (the views otherwise use a process's id as words), `order` sets the
order of the processes' rows, and `links` adds links to the ones every view shows (this viewer and the Meaning Model).
The processes view's QR code button shows the same links as codes.

## What the views read from the model

- **Whose each record is.** Every Event is governed by the nearest declared context root above it, found through
  containment: the accepted world, a person's inner process, or a holder's understanding
  (`meaning_model.context_roots`). A model that declares none is all world. Inner Events are drawn as that person's
  own, with dashed lines and italic names, never with the world's authority.
- **Lens readings.** Since the Meaning Model placed readings beneath their holders, a reading is an Event under its
  holder's root (`reading.<lens>.<record>` under an understanding root, or `inner.<lens>.<record>` for an actor's own
  reasons) that is `about` the record it reads. The explorer shows it as that holder's reading of the record, with
  its question, unit, every answer with the remainder, and its provenance; readings are never merged across holders.
  Runs made with Meaning Model 0.3.0 keep their readings on the records they read, and the views show those too.
- **The story's text** as the Meaning Model renders it from the story graph (`life_narrative_render`), and its title
  from the story's own document.

## The data file: `meaning-model-viewer/2`

`extract.mjs` turns a run into one JSON file, which is what the views read: the people with their lives, periods,
change arcs, decisions and the series of what they want and feel; every Event with its depth, role, owner, context and
time in the tree; every process with its home, its parent and its authored path; the lenses and their readings; the
causal relations; the story graph's notes and edges; the rendered story, each part placed among the moments it tells;
and the construction's steps, times and tool calls. `schema`, `runFormat` and `meaningModel` say what made it.

## Links into a view

Every view takes `?data=<name>` (by default the first run) and `&title=`. The explorer's URL follows what it shows,
so a view can be copied as it is: `view=together`, `zoom=story|life|centuries|world` (with `life=<first name>`),
`t0=` and `t1=` in years, `focus=<event id>`, `depth=`, `show=processes,subsidiary,events,decisions,causal,notes,prose`,
`lenses=all` or lens ids, and `fold` to fold its panel. The processes view takes `&play`, `&still`, `&read`, `&qr` and
`&nothoughts`; the landscape takes `&play`, `&still`, `&read` and `&live`.

## Versions

- **0.2.0** opens any run with one command, and reads lens readings placed beneath their holders.
- **0.1.0** is the landscape and the processes view as the story repo shows *Twelve Words* (The Rabbit Hole), pinned
  there as a copy.

## License

MIT, in [LICENSE](LICENSE). three.js is vendored in `public/vendor/three` under its own MIT license.
