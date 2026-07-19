# AGENTS.md — pi-openplan

## Quick Start

Requires Node 22+.

```bash
npm install            # install dev deps (peer deps only — no runtime bundled)
npm run typecheck      # tsc --noEmit (no build step; TS files loaded directly)
npm run lint           # biome check .
npm run lint:fix       # biome check --write . (auto-fix)
npm run format         # biome format --write .
npm test               # vitest — 10 test files, 231 tests (vitest.config.ts in root)
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest with v8 coverage (excludes index.ts)
pi -e .                # load extension locally in pi for manual testing
```

## What This Is

A **pi extension** (v1.7.0), not a standalone app. The host is `pi` CLI. Single extension under `extensions/plan-mode/` with 9 TypeScript source files. Adds read-only plan mode, structured plan files, interactive Q&A, and phased execution tracking.

## Architecture (non-obvious)

- **No build step.** `tsconfig.json` uses `allowImportingTsExtensions: true` and `moduleResolution: "bundler"`. TypeScript `.ts` files are the runtime source — pi resolves them directly. `tsc --noEmit` is typecheck-only.
- **No bundler, no dist/.** `npm pack` includes raw `extensions/` directory. The `"files"` field in `package.json` ships only `extensions/`, `CHANGELOG.md`, `README.md`, `LICENSE`.
- **Entry point:** `extensions/plan-mode/index.ts` exports `default function planModeExtension(pi: ExtensionAPI)`.
- **State machine:** Normal Mode → Plan Mode (read-only) → Execution Mode (edit/write restored, DONE tracking) → Normal Mode.
- **Tool restriction** via `pi.setActiveTools([...])`. `PLAN_MODE_TOOLS` blocks `edit` and `write`; `NORMAL_MODE_TOOLS` includes them. Bash safety is a separate dual-gate check in the `tool_call` event hook.
- **State persistence** via `pi.appendEntry("plan-mode-v2", {...})`. Survives restarts. Restored in the `session_start` event hook.
- **All mutable state** lives in the `PlanModeState` object created in `index.ts` and passed by reference to commands, events, and tools modules. No global/shared state across modules.
- **6 event hooks:** `tool_call` (bash safety), `before_agent_start` (system prompt injection), `turn_end` (DONE tracking), `agent_end` (completion/pause detection + plan step extraction), `session_start` (state restore), `context` (filter stale plan messages when not in plan mode).
- **5 LLM tools:** `plan_write`, `plan_read`, `plan_list`, `plan_question`, `plan_edit`.
- `plan_edit` supports section-based replacement (match by heading) or full-content overwrite. Handles frontmatter stripping and heading-match robustness.

## Key Conventions

- **Biome for lint/format.** Not ESLint, not Prettier. Config is inline/embedded in Biome defaults. `npm run lint:fix` auto-fixes.
- **TypeBox for tool parameter schemas** — `Type.Object({...})`, `Type.String()`, etc. Peer dependency.
- **Plan files** live in `.pi/plans/` (gitignored). One `.md` file per plan with YAML frontmatter (`title`, `status`, `created`, `type`, optional `updated`). Statuses: `draft`, `approved`, `in_progress`, `done`. Types: `feature`, `fix`, `refactor`, `chore`.
- **Bash safety is dual-gate:** a command must _not_ match any destructive pattern AND _must_ match a known safe pattern. Unknown commands (matching neither list) are conservatively blocked. Safe patterns cover npm, yarn, pnpm, bun, cargo, go, pytest, and common dev tools.
- **System prompt only injected once per mode session** (`planModeTurnCount <= 1` gets full prompt; later turns get brief ~200-token variant).
- **Progress tracking** via `[DONE:n]` tags in agent responses. Extraction handles interruption — on session resume, re-scans all messages after the `plan-mode-execute` entry marker.

## Development Flow

1. Edit `.ts` files in `extensions/plan-mode/`
2. Run `npm run typecheck` to verify types
3. Run `npm run lint` to check formatting/style
4. Test manually with `pi -e .` (loads extension from current dir)
5. CI runs `npm ci && npm run typecheck && npm run lint && npm test` in that order

## Release

release-please automates versioning from conventional commits on `main`. On release creation, a separate `publish` job runs `npm publish --provenance --access public` with NPM OIDC. Requires `publish` environment secret `NPM_TOKEN`.

## Gotchas

- **Tools MUST throw errors to signal failure** — returning `{ isError: true }` from `execute()` has no effect in pi runtime. The error flag is only set when the tool throws.

- **Peer dependencies must match host pi version.** Dev deps use `^0.74.0` — check pi's actual version if breakage occurs.
- **`npm install` only installs dev deps for typechecking.** The extension has zero runtime dependencies; all APIs come from pi's core packages.
- **`moduleResolution: "bundler"`** means `.ts` extensions are required in imports. Don't drop them.
- **`plan-files.ts` uses the SDK frontmatter parser** (`parseFrontmatter` from `@earendil-works/pi-coding-agent`) for robust YAML handling (colons, quotes, multi-line). The same import in `tools.ts` strips existing frontmatter when rendering plan content inline.
- **Plan question tool async await pattern** — uses `ctx.ui.custom<string[][] | null>(...)` with a callback returning `{ render, invalidate, handleInput }`. The `done` callback resolves the promise. Non-interactive mode (no TUI) returns questions as text.

- **Testing uses `memfs`** for in-memory filesystem mocks in `plan-files-fs.test.ts`. The `tests/helpers.ts` file provides mock factories (`createMockPi`, `createMockCtx`, `createTestState`, `createCallbacks`) used across the test suite.

- **Coverage excludes `index.ts`** — the orchestrator is intentionally excluded from coverage in `vitest.config.ts` since it only wires together modules.
