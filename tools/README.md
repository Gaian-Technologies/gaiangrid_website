# Animated Grid

This directory owns the internal authoring inputs for the animated grid diagram.

`tools/` is not part of the public web root. Files here are operator-facing source files, not browser-served assets.

## Build

Build the scene artifact with:

```bash
node tools/build-grid.mjs
```

That reads [grid.txt](./grid.txt) and writes:

```text
src/assets/grid-scene.json
```

The generated JSON is the browser-facing scene artifact for the animated diagram runtime.

## Source Of Truth

The diagram topology is authored in [grid.txt](./grid.txt).

The format is a strict ASCII map with two required sections:

- `[grid]` for node and connector layout
- `[legend]` for symbol-to-node-type mapping

Supported connector tiles:

- `-`
- `|`
- `+`

Supported node symbols:

- `A-Z`
- `0-9`

Supported node types:

- `consumer`
- `generator`
- `main`

Each node symbol must appear exactly once and must connect on exactly one side.
