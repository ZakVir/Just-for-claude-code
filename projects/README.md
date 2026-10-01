# Projects

Each folder here is a self-contained Claude Code project. See the root
[`CLAUDE.md`](../CLAUDE.md) for conventions.

## Index

| Project | Description |
| ------- | ----------- |
| [`_template`](./_template) | Starting point — copy this to begin a new project. |
| [`design-reference-mcp`](./design-reference-mcp) | Local MCP server for design research — search galleries/repos/design systems, extract tokens, screenshot live sites, and grow a self-indexed keeper library. |
| [`pet-sitting-site`](./pet-sitting-site) | Test build proving `design-reference-mcp` end to end: a pet-sitting landing page built from real MCP-researched inspiration, with full session logs and pulled assets as proof. |
| [`calm-companion-app`](./calm-companion-app) | Screen designs (no working code) for Puff, a calm breathing-companion mobile app — researched via `design-reference-mcp`, published as an Artifact. |
| [`polymarket-kronos-scalper`](./polymarket-kronos-scalper) | Multi-strategy, evidence-ranked plan for Polymarket BTC markets from 15-minute to yearly (options-anchored pricing, maker-first, arbitrage scanner), with tested reference maths and live experiments (Deribit fair-value scan, ladder calibration, Kronos vs TimesFM 3 shootout). No trading code. |

_Add a row above for each new project you create._

## Starting a new project

```bash
cp -r projects/_template projects/my-new-thing
```

Then edit `projects/my-new-thing/README.md` and start building.
