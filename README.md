# Meaning Model Viewer

Open saved [Meaning Model](https://github.com/emergent-wisdom/meaning-model) runs in the **same browser viewer included with Meaning Model MCP 0.5.0**. This repository supplies a command-line launcher and run reader. The MCP package owns the interface and its model interpretation; there is no separate copy to fall behind.

For normal modeling, install the MCP in your AI app and ask **“Open this model.”** The assistant returns a local browser link. You do not need this repository. Ask **“Open these models together”** to switch between selected models in one viewer.

The tools include no story datasets and do not download them automatically. The public [Twelve Words and Book of Conditions examples](https://github.com/emergent-wisdom/story) are separate, optional downloads. Use `--data <folder>` to open downloaded viewer snapshots.

## Open an existing run

Requires Node.js 22.18 or later.

```sh
git clone https://github.com/emergent-wisdom/meaning-model-viewer
cd meaning-model-viewer
npm install
npx meaning-model-mcp --install-engine
node serve.mjs --run ../story/runs/rabbit-hole
```

Open the local URL printed by the command (port 8765 by default). Several `--run` arguments open several models in the Model selector. Set `--port` or `PORT` to change the port.

The run reader makes an online backup of the run's SQLite database, opens that temporary copy, and calls the MCP's construction exporter and renderer. It does not write into the run or start another writer on its database. The temporary backup is removed afterwards.

To use an unpublished checkout, set `MEANING_MODEL_DIR` to the Meaning Model repository root; optionally set `LIFE_SIM_ENGINE_BIN` to its built engine. The selected MCP supplies both the snapshot builder and browser assets.

### Run options

Options following a `--run` apply to that run:

| Option | Meaning |
| --- | --- |
| `--name <name>` | Stable name for the run. |
| `--label <text>` | Label in the Model chooser. |
| `--title <text>` | Override the title. |
| `--config <viewer.json>` | Existing run display configuration. |
| `--log <file.jsonl>` | Earlier call log, before the run's own log. |
| `--graph <hash>` | Exact graph revision, overriding the most recent logged write. |
| `--state <file.sqlite>` | Explicit database when a run contains several. |
| `--scopes <a,b>` | Additional scopes needed to export the complete run. This does not filter private records. |

A run follows `meaning-model-run/1`: `mcp-transcript.jsonl` and its engine database sit in the run directory or `novel/`, with optional `inputs/` and `viewer.json`. The command log establishes construction timestamps. Missing timestamps stay unknown.

## Explore the model

**Show it as** switches Processes (together or layers), Tree, Terrain, Graph, Structure and Space in one page. **Coarse view** gives an overview; more detail reveals subprocesses. Space uses declared positions and reference frames. Graph layout is not physical geography. **Recenter** or Home fits the active representation.

The controls, full-document reader, document positions and numerical inspector are the MCP's current implementation. Passage placement follows declared Event links. Graph and Structure retain the native records; Space distinguishes declared positions from qualitative settings. Nothing is placed geographically from word matching.

By default, each link identifies an immutable snapshot. Reopen after model changes to see the new revision. For existing run workflows, `--live` checks the run once a minute. The browser then reloads the current representation when a new revision is available, preserving its URL state and waiting for playback to pause. Live following stays enabled across model switches, including Graph, Structure and Space. This explicit live mode differs from the MCP's immutable snapshot links. Failed refreshes retain the last available view. All links stop working when this launcher stops.

Old `/processes.html`, `/landscape.html` and `/explorer.html` links redirect to Processes, Terrain and Graph in the current interface, preserving their query options and selected dataset. This keeps event QR links useful without maintaining old interfaces.

## Export or view snapshot files

```sh
node extract.mjs --run ../story/runs/rabbit-hole --out .local-work/rabbit-hole.json
node serve.mjs --data .local-work
```

`--data` opens JSON snapshots prepared by this version's shared MCP builder. Older viewer JSON lacks native model records: regenerate it from its run rather than displaying incomplete Graph or Space views. A static model and graph can also be read with `--static <model.json> <graph.json>`; pass `--render <render.json>` for its exact MCP document render.

Exports are complete author views, including model definitions, notes and construction information. They are **not public reader projections**. The default output is `.local-work/run.json`, ignored in this repository. `--scopes` grants export access; it is not a publication filter. Review public snapshots explicitly and keep private databases, logs, intermediate revisions and conversations out of websites and releases. This package contains no story datasets.

## Development and releases

Run `npm test` after installing Meaning Model MCP 0.5.0, or set `MEANING_MODEL_DIR` to its checkout. Tests exercise shared data interpretation, exact asset serving, grouped model links, old URLs and read-only serving.

This project is distributed through GitHub. Version 0.5.0 switches the launcher and extractor to the bundled MCP viewer, including Graph, Structure and Space. Earlier versions remain available in Git history. UI fixes belong in `meaning-model/mcp-server/viewer/` so MCP users and standalone users receive the same changes.

Code is MIT; see [LICENSE](LICENSE). Third-party viewer notices ship with the MCP package.
