# Meaning Model Viewer

Open a [Meaning Model](https://github.com/emergent-wisdom/meaning-model) run and see what the agent built: the world,
the lives in it and how they change, modeled as events and processes over time. One command reads a run folder and
serves it in one view, at the server's root.

The view opens as the processes view showed *Twelve Words* on stage: every named process the agent modeled as a
curtain of light on its own scale over the story's years, the events that move them as threads through every process
they touch, the decisions the model drew, the love-or-fear split behind the acts, the causal links between events, and
the agent's thoughts behind them, slowly turning. Press play to sweep through the years. A small toolbar on the view
chooses how to show it, as in the understanding graph: click a control and its choices appear below it. Point at
anything in the view to read what it is, and click it to keep that open beside the view. The URL keeps every choice:

- **Story.** When the viewer has more than one run open, which one to show, from a dropdown. It opens on the run an
  agent worked on last.
- **Camera.** *Spinning*, as it always turned; *Free*, to turn it (drag), move it (right-drag), come closer to what
  is under the pointer (scroll) and walk through it with the keys yourself; or *Locked*, a steady framing from the front in which scrolling or pinching zooms in time and
  dragging pans, and a view taller than the window moves up and down (shift and scroll, or the arrow keys).
- **Shining** or **Less shining**: the full glare of the stage, or a quieter look without the haze.
- **Edges**: the lines that link one thing to another (the thoughts' threads to their moments, the links between
  documents, the causal links, the tree's connectors), shown or hidden when they distract; a document pointed at still
  shows its own.
- **Show everything**: every kind of record, every lens and the whole tree at once; pressed again, the view as the
  stage showed it.
- **Play.** *The story's years*, as history plays forward: the curtains draw on, and the events, decisions, readings
  and prose appear as their moments come. Or *the construction*: the model and the story graph as the agent built
  them, step by step, with the agent's own reasons as captions and the idle time between its calls shortened. Each
  has play, pause, a scrubber and a speed, and **Read the story** shows the text as far as the play has come, beside
  the view or in **Full view** across the window (`F`), with **Download .md** to save the whole story as the Meaning
  Model renders it.
- **Time.** From a single day to the model's deep past: *Story*, *A life* (press again for the next person's), *Centuries*
  and *World history*, or anywhere between (shift and scroll, or scroll when locked, zooms around the pointer). The
  axis is linear across a life and a log scale of years before the present at the scale of world history.
- **Show it as.** *Processes* lays every process in one field, as the stage showed it. *Tree* stacks the model's tree
  level by level, each level a floor below and in front of the one that holds it: the world, its long developments,
  places and institutions and each person's life, their periods and change arcs, the phases of each change and the
  moments within them, with every process at the level of what holds it. *Terrain* shows every function of the model
  as one terrain, as the landscape showed it: each life with its periods as plateaus and its shocks as peaks, the
  processes it runs through, what each person wants, feels and expects, and the world's long developments behind them,
  with Events as beams, decisions as diamonds and the agent's notes and prose above. On the terrain, Details adds or
  takes away the named processes (as ridges of their own), the events, the decisions, the causal links and the
  thoughts.
- **Depth** sets how far down the tree the view goes, and **Show** adds or takes away each kind of record: the named
  processes, the events that move them, decisions, love or fear, causal links, the agent's thoughts, the tree of
  Events, the subsidiary processes (each life's slow processes, the change arcs and their phases), and the prose part
  by part. **Lenses** shows each lens's readings over the records they read, with whose reading each is. These are
  under **Details**. The causal links run as arcs between the events they link: point at one to read which event
  causes, enables or constrains which, and why.

**The story's own time.** Below the view, a strip holds the story's parts in reading order, each as long as its words,
and lights the part the play is in (in the construction, the part the agent was writing); the caption names it. Point
at a part to see its linked Events, and click it to visit its first linked moment and read it. World time comes from
the passage's declared `renders` links in the story graph. A flashback can go backwards in world time without moving
in reading order, and several parts can depict the same Event. Parts without dated links stay readable in the strip
and say that their world time is unlinked or undated. A depiction link does not mean every fact in that Event has been
revealed to the reader.

**Numbers.** Pointing at a curtain gives its displayed value and unit, alongside the source wording. These paths are
parsed from the model's prose support: values between samples are interpolated, values beyond the samples are held,
and a stated range is drawn at its midpoint. The tooltip identifies those estimates and any inferred dates. An event
gives the displayed value of each process it moves; on the terrain, a ridge gives its number. Clicking keeps it open
beside the view.

Keys: `W` `A` `S` `D` walk through the view, `Q` and `E` go down and up, the arrows look around and `Shift` goes faster
(the first step stops the spin; locked, `A` and `D` move through time and `W` and `S` zoom it); `1`–`4` the scales,
`T` processes, `L` tree, `R` terrain, `Space` play, `C` the camera, `G` shining, `K` edges, `X` everything.

The view was made for [*Twelve Words*](https://github.com/emergent-wisdom/story), the novel an agent wrote live
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

Then open http://localhost:8765: the run opens in the view. The second line installs the published Meaning Model, which the viewer uses to read a
run; the third fetches its engine for your platform, once. To see *Twelve Words*:

```sh
git clone https://github.com/emergent-wisdom/story ../story
node serve.mjs --run ../story/runs/rabbit-hole
```

The title comes from the run's `viewer.json`, else from its own story. A run is read once at the start; `--live` reads
it again every minute while an agent is still working, and the view opened with `&live` follows it. `--run` can be
given several times, and the view's story dropdown then chooses between the runs; `--port` (or `PORT`) sets the port. After a
`--run`, these apply to that run:

| Flag | What it does |
| --- | --- |
| `--name <name>` | The name the view uses for it in `?data=` (by default the folder's name). |
| `--label <text>` | What the view's choice of runs calls it (by default its title). |
| `--title <title>` | A title of your own instead of the story's. |
| `--config <viewer.json>` | How to show it, when the run folder has no `viewer.json` of its own (see below). |
| `--log <file.jsonl>` | An earlier call log that comes first, such as the log of the run a fork was made from, so the construction replay reaches back to it. |
| `--graph <hash>` | The story graph to read, instead of the newest one the log names. |
| `--state <file.sqlite>` | The engine state, when the run folder holds more than one SQLite file. |

The viewer never writes into a run and never calls the run's own server: it reads the call log and an online backup of
the engine state, which is safe while the agent works. A run made with a Meaning Model newer than the published
package is read with that version: set `MEANING_MODEL_DIR` to its checkout (and `LIFE_SIM_ENGINE_BIN` to its engine
if it is not in `rust-engine/target/release`).

`node extract.mjs --run <run folder> --out <file.json>` makes the view's data file for a run on its own, and
`node serve.mjs --data <folder>` serves a folder of such files.

The export includes the author's construction history, notes and readings. By default the extractor uses all scopes
found in the run. `--scopes` adds scopes; it does not filter the export for publication. Review a data file before
sharing it. Source releases of this viewer contain no book or run data.

For a static website, publish `public/` together with the selected exports at `data/<name>.json` and a
`data/index.json` such as `{"default":"story","runs":[{"name":"story","label":"Twelve Words"}]}`.
The QR images need the local server's `/qr.svg` endpoint and are hidden when it is unavailable.

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
  "title": "The Rabbit Hole",
  "from": 2019.4,
  "names": { "kieran.sharehouse_belonging": "belonging to the Sharehouse" },
  "order": ["kieran.sharehouse_belonging"],
  "links": [{ "label": "The story", "url": "https://github.com/emergent-wisdom/story" }]
}
```

`title` is the title the view shows (else the story's own), `from` the year the story's years begin on screen (else a
little before the story's first moment), `names` gives the processes names of their own (the view otherwise uses a
process's id as words), `order` sets the order of the processes' rows, and `links` adds links to the ones the view
always shows (this viewer and the Meaning Model). The QR code button shows the same links as codes.

## What the view reads from the model

- **Whose each record is.** Every Event is governed by the nearest declared context root above it, found through
  containment: the accepted world, a person's inner process, or a holder's understanding
  (`meaning_model.context_roots`). A model that declares none is all world. Inner Events are drawn as that person's
  own, with dashed lines and italic names, never with the world's authority.
- **Lens readings.** Since the Meaning Model placed readings beneath their holders, a reading is an Event under its
  holder's root (`reading.<lens>.<record>` under an understanding root, or `inner.<lens>.<record>` for an actor's own
  reasons) that is `about` the record it reads. The view shows it as that holder's reading of the record, with
  its question, unit, every answer with the remainder, and its provenance; readings are never merged across holders.
  Runs made with Meaning Model 0.3.0 keep their readings on the records they read, and the view shows those too.
- **The story's text** as the Meaning Model renders it from the story graph (`life_narrative_render`), and its title
  from the story's own document.

## The data file: `meaning-model-viewer/2`

`extract.mjs` turns a run into one JSON file, which is what the view reads: the people with their lives, periods,
change arcs, decisions and the series of what they want and feel; every Event with its depth, role, owner, context and
time in the tree; every process with its home, its parent and its authored path; the lenses and their readings; the
causal relations; the story graph's notes and edges; the rendered story, each part placed among the moments it tells;
and the construction's steps, times and tool calls. `schema`, `runFormat` and `meaningModel` say what made it.

## Links into a view

The view takes `?data=<name>` (by default the first run) and `&title=`. Its URL follows what it shows, so a view can be
copied as it is. Each option is left out while it is as the stage showed it:

| Option | Values |
| --- | --- |
| `camera` | `spin` (the default), `free` or `locked`; `pose=x,y,z,tx,ty,tz` keeps a free camera's place |
| `glare` | `full` (shining, the default) or `soft` (less shining); `edges=off` hides the lines that link things |
| `mode` | `story` (the default) or `construction`; `speed=0.25`, `0.5`, `1`, `2` or `4`; `at=` the play's position, a year or an ISO time |
| `zoom` | `story` (the default), `life` (with `life=<first name>`), `centuries` or `world`; or `t0=` and `t1=` in years, or `focus=<event id>` |
| `view` | `together` (the processes, the default), `layers` (the tree) or `terrain`; `depth=` 0 to 6 (2 by default) |
| `show` | any of `processes,threads,decisions,lovefear,causal,notes,events,subsidiary,prose` (the first six by default) |
| `lenses` | `all` or lens ids |
| `everything` | every kind of record, every lens and the whole tree |

The view also takes the stage's own: `&play` starts the play, `&still` stops the spin (the free camera), `&read` opens
the story (`&read=full` across the window), `&qr` the QR codes, `&nothoughts` hides the thoughts, and `&capture` hands a recorder
`window.__frame(t, dt)` to draw one frame at a time.

The pages of earlier versions open the view with what they showed: `processes.html` as it is, `explorer.html` locked,
as the tree with the named processes and less shining, and `landscape.html` as the terrain
across all the model's years, playing the construction (with its `&play`, `&read`, `&live`, and `&still` as the free
camera).

## Versions

- **0.3.1** places passages by their declared Event links, preserves flashbacks, leaves unlinked world time unknown,
  and labels parsed, interpolated and held display values with their source wording.
- **0.3.0** is one view, at the viewer's root: the processes view as the stage showed it, with the run, every camera,
  shining or less, both plays, the explorer's scales, tree, depth and records, and the landscape's terrain in a small
  toolbar on the view, and anything in it can be clicked to read what it is. The explorer's and the landscape's pages
  open it with their options.
- **0.2.0** opens any run with one command, and reads lens readings placed beneath their holders.
- **0.1.0** is the landscape and the processes view as the story repo shows *Twelve Words* (The Rabbit Hole), pinned
  there as a copy.

## License

MIT, in [LICENSE](LICENSE). three.js is vendored in `public/vendor/three` under its own MIT license.
