# AGENTS.md — pi-openplan

## Quick Start

```bash
npm install            # install dev deps (peer deps only — no runtime bundled)
npm run typecheck      # tsc --noEmit (no build step; TS files loaded directly)
npm run lint           # biome check .
npm run format         # biome format --write .
npm test               # exits 0 — no tests exist yet
pi -e .                # load extension locally in pi for manual testing
```

## What This Is

A **pi extension** (v1.3.0), not a standalone app. The host is `pi` CLI. Single extension under `extensions/plan-mode/` with 9 TypeScript source files. Adds read-only plan mode, structured plan files, interactive Q&A, and phased execution tracking.

## Architecture (non-obvious)

- **No build step.** `tsconfig.json` uses `allowImportingTsExtensions: true` and `moduleResolution: "bundler"`. TypeScript `.ts` files are the runtime source — pi resolves them directly. `tsc --noEmit` is typecheck-only.
- **No bundler, no dist/.** `npm pack` includes raw `extensions/` directory. The `"files"` field in `package.json` ships only `extensions/`, `CHANGELOG.md`, `README.md`, `LICENSE`.
- **Entry point:** `extensions/plan-mode/index.ts` exports `default function planModeExtension(pi: ExtensionAPI)`.
- **State machine:** Normal Mode → Plan Mode (read-only) → Execution Mode (edit/write restored, DONE tracking) → Normal Mode.
- **Tool restriction** via `pi.setActiveTools([...])`. `PLAN_MODE_TOOLS` blocks `edit` and `write`; `NORMAL_MODE_TOOLS` includes them. Bash safety is a separate dual-gate check in the `tool_call` event hook.
- **State persistence** via `pi.appendEntry("plan-mode-v2", {...})`. Survives restarts. Restored in the `session_start` event hook.
- **All mutable state** lives in the `PlanModeState` object created in `index.ts` and passed by reference to commands, events, and tools modules. No global/shared state across modules.
- **6 event hooks:** `tool_call` (bash safety), `before_agent_start` (system prompt injection), `turn_end` (DONE tracking), `agent_end` (completion/pause detection + plan step extraction), `session_start` (state restore), `context` (filter stale plan messages when not in plan mode).
- **4 LLM tools:** `plan_write`, `plan_read`, `plan_list`, `plan_question`.

## Key Conventions

- **Biome for lint/format.** Not ESLint, not Prettier. Config is inline/embedded in Biome defaults. `npm run lint:fix` auto-fixes.
- **TypeBox for tool parameter schemas** — `Type.Object({...})`, `Type.String()`, etc. Peer dependency.
- **Plan files** live in `.pi/plans/` (gitignored). One `.md` file per plan with YAML frontmatter (`title`, `status`, `created`, `type`, optional `updated`). Statuses: `draft`, `approved`, `in_progress`, `done`. Types: `feature`, `fix`, `refactor`, `chore`.
- **Bash safety is dual-gate:** a command must _not_ match any destructive pattern AND _must_ match a known safe pattern. Unknown commands (matching neither list) are conservatively blocked.
- **System prompt only injected once per mode session** (`planModeTurnCount <= 1` gets full prompt; later turns get brief ~200-token variant).
- **Progress tracking** via `[DONE:n]` tags in agent responses. Extraction handles interruption — on session resume, re-scans all messages after the `plan-mode-execute` entry marker.

## Development Flow

1. Edit `.ts` files in `extensions/plan-mode/`
2. Run `npm run typecheck` to verify types
3. Run `npm run lint` to check formatting/style
4. Test manually with `pi -e .` (loads extension from current dir)
5. CI runs `npm ci && npm run typecheck && npm run lint` in that order

## Release

release-please automates versioning from conventional commits on `main`. On release creation, a separate `publish` job runs `npm publish --provenance --access public` with NPM OIDC. Requires `publish` environment secret `NPM_TOKEN`.

## Gotchas

- **Peer dependencies must match host pi version.** Dev deps use `^0.74.0` — check pi's actual version if breakage occurs.
- **`npm install` only installs dev deps for typechecking.** The extension has zero runtime dependencies; all APIs come from pi's core packages.
- **`moduleResolution: "bundler"`** means `.ts` extensions are required in imports. Don't drop them.
- **`plan-files.ts` has its own frontmatter parser** (simple regex-based). The `parseFrontmatter` import in `tools.ts` is from `@earendil-works/pi-coding-agent` (different parser, used for stripping existing frontmatter when rendering plan content inline).
- **Plan question tool async await pattern** — uses `ctx.ui.custom<string[][] | null>(...)` with a callback returning `{ render, invalidate, handleInput }`. The `done` callback resolves the promise. Non-interactive mode (no TUI) returns questions as text.
