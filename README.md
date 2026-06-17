# pi-openplan

> Plan mode extension for [pi](https://pi.dev) — read-only exploration, structured planning, and phased execution tracking.

Toggle into plan mode to safely explore codebases, research approaches, write structured plans, and execute them phase by phase with progress tracking.

## Features

| Feature | Description |
|---|---|
| **Read-only mode** | Blocks `edit`/`write` tools and destructive bash commands via dual-gate safety |
| **Structured plans** | Save plans to `.pi/plans/` with YAML frontmatter (title, status, type, dates). Renders inline in conversation on save. |
| **Plan management** | LLM tools: `plan_write`, `plan_read`, `plan_list` with status filtering |
| **Interactive Q&A** | `plan_question` tool — TUI overlay with options, multi-select, and free-text answers |
| **Progress tracking** | Mark steps complete with `[DONE:n]` tags — widget shows live progress. Survives restarts. |
| **Pause points** | `⏸️ PAUSE` markers create verification gates. Auto-pauses execution at each gate. |
| **State persistence** | Plan mode, todos, and execution mode survive session restarts and `/reload` |

## Installation

```bash
pi install npm:pi-openplan          # from npm
pi install git:github.com/wilfredinni/pi-openplan  # from git
pi -e ./path/to/pi-openplan         # try without installing
```

After installing, restart pi or run `/reload`.

## Quick Start

```
/plan                 # enable plan mode (read-only)
/plans                # list saved plans
/execute_plan <name>  # execute a saved plan
/plan                 # disable plan mode (full access restored)
```

## Commands

### `/plan`
Toggle plan mode. When enabled, tools are restricted to read-only and bash commands go through the dual-gate safety check (see [Bash Safety](#bash-safety)).

### `/plans`
List all saved plans from `.pi/plans/` with filename, status, title, and creation date.

### `/execute_plan [plan-name]`
Exit plan mode and execute a saved plan. Loads the plan, extracts phases, and sets status to `in_progress`. If the plan is not found, execution is aborted and plan mode is restored. Run without a name to enter generic execution mode.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+P` | Toggle plan mode |

## CLI Flags

```bash
pi --plan    # start pi in plan mode
```

## LLM Tools

These tools are registered for the agent to call during plan mode:

**`plan_write`** — Save a plan. Accepts `filename`, `title`, `content` (markdown), and optional `type` (`feature`, `fix`, `refactor`, `chore`).

**`plan_read`** — Read a saved plan by filename (fuzzy match). Use `full: false` for metadata only.

**`plan_list`** — List all plans, optionally filtered by `status` (`draft`, `approved`, `in_progress`, `done`).

**`plan_question`** — Present clarifying questions with options. Supports single-select, multi-select, and custom free-text. Max 4 questions, 2–4 options each. Falls back to text in non-interactive mode.

**`plan_edit`** — Edit existing plans. Update a specific section by heading name (e.g. "Approach", "Phase 1: Setup") or replace the entire content. On full replace, the old version is preserved as a Previous Version appendix.

## Bash Safety

Plan mode uses a **dual-gate** system to block destructive commands:

1. **Destructive gate** — blocks 32 patterns (`rm`, `mv`, `git push`, `npm install`, `sudo`, `curl -d`, `curl -o`, `wget -O`, pipe-to-interpreter, etc.)
2. **Safe gate** — only allows 48 known-safe patterns (`cat`, `grep`, `ls`, `git status`, `git log`, `npm list`, `curl` (read-only), `wget -O -`, etc.)

A command must pass **both** gates. Unknown commands are conservatively blocked.

## Plan File Format

Plans are markdown files in `.pi/plans/` with YAML frontmatter:

```markdown
---
title: "Feature Name"
status: draft
created: "2026-01-15T12:00:00Z"
type: feature
---

# Feature Name Implementation Plan

## Overview
...
```

**Statuses:** `draft`, `approved`, `in_progress`, `done`
**Types:** `feature`, `fix`, `refactor`, `chore`

### Progress Tracking

During execution, include `[DONE:n]` in responses where `n` matches the phase number. The widget updates automatically. On session resume, completed markers are re-scanned to restore state.

### Pause Points

Include `⏸️ PAUSE` or `PAUSE` in your plan to create verification gates. The extension pauses and asks for confirmation before continuing.

## Plan Mode Workflow

1. **Toggle on** — `/plan` or `Ctrl+Alt+P`
2. **Explore** — read files, search code, research approaches (read-only)
3. **Ask** — use `plan_question` to clarify scope, constraints, priorities
4. **Plan** — agent creates a structured plan via `plan_write` with phases, verification, risks
5. **Edit** — refine the plan with `plan_edit` (update sections or full replace; previous version preserved)
6. **Review** — agent presents plan summary and stops
7. **Execute** — `/execute_plan <plan-name>` loads plan, begins phased execution
8. **Track** — use `[DONE:n]` to mark steps complete
9. **Verify** — review at each `⏸️ PAUSE` gate before continuing
10. **Complete** — all steps done; extension announces completion, resets execution mode

## Development

```bash
npm install            # install dev deps (typecheck/lint/test only)
npm run typecheck      # tsc --noEmit
npm run lint           # biome check .
npm run lint:fix       # biome check --write .
npm test               # vitest — 204 tests, 10 files
npm run test:coverage  # vitest with v8 coverage
pi -e .                # load extension locally
```

See [AGENTS.md](./AGENTS.md) for architecture, release process, and gotchas.

## Requirements

- [pi](https://pi.dev) 0.74.0 or later
- Node.js 22+

## License

MIT
