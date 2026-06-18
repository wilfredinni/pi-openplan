[![npm](https://img.shields.io/npm/v/pi-openplan)](https://www.npmjs.com/package/pi-openplan)
[![License](https://img.shields.io/npm/l/pi-openplan)](LICENSE)
[![CI](https://github.com/wilfredinni/pi-openplan/actions/workflows/ci.yml/badge.svg)](https://github.com/wilfredinni/pi-openplan/actions)

# pi-openplan

> Structured planning mode for [pi](https://pi.dev) — explore codebases safely,
> write multi-phase plans, then execute them with live progress tracking.

Switch to read-only plan mode to research and design before you build. Write
structured plans with phases, verification gates, and `⏸️ PAUSE` markers. Execute
them step by step — tag `[DONE:n]` to track progress, auto-complete when all
done. Everything survives restarts and `/reload`.

## Install

```bash
pi install npm:pi-openplan                         # from npm
pi install git:github.com/wilfredinni/pi-openplan  # from GitHub
pi -e .                                             # try local checkout
```

Requires pi 0.74+ and Node.js 22+.

## Quick Start

```
/plan                   # enter read-only plan mode (or pass --plan on startup)
/plans                  # list saved plans
... explore, search, ask the agent questions ...
                        # agent saves a plan via plan_write with phases + ⏸️ gates
/execute_plan <name>    # restore full tools, start executing
... tag [DONE:1] as you complete each phase ...
/plan                   # back to normal mode
```

Shortcut: `Ctrl+Alt+P` toggles plan mode from anywhere.

## Why Plan Mode?

Vanilla pi is fast. But when you need to design before coding — or guide an agent
through a multi-step implementation — plan mode adds safety, structure, and clarity
that vanilla sessions don't provide.

| | Vanilla pi | pi-openplan |
|---|---|---|
| **Safety** | All tools always available | Read-only mode blocks edits + dual-gate bash safety |
| **Structure** | No plan persistence | `.pi/plans/` with YAML frontmatter (title, status, type, dates) |
| **Progress** | Manual tracking | `[DONE:n]` auto-updates a live TUI widget; re-scanned on resume |
| **Clarity** | Inline Q&A only | `plan_question` TUI overlay with tabs, options, multi-select, free-text |

## Features

- **Read-only mode** — `/plan` toggles off `edit`/`write`. Bash safety blocks 32 destructive patterns, allows 48 safe ones.
- **Structured plans** — Save to `.pi/plans/` with type (`feature`, `fix`, `refactor`, `chore`) and status (`draft`, `approved`, `in_progress`, `done`). Plans render inline in conversation on save.
- **Plan management** — LLM tools: `plan_write`, `plan_read`, `plan_list`, `plan_edit` (section-level or full replace; previous version preserved).
- **Interactive Q&A** — `plan_question` presents a TUI overlay with tabs, single/multi-select, and custom text input. Falls back to text in non-interactive mode.
- **Phased execution** — `/execute_plan` loads saved plan, extracts phases. Tag `[DONE:n]` to mark steps; pauses for confirmation at `⏸️` markers. Auto-detects completion and resets state.
- **State persistence** — Plan mode, todos, active plan, and execution state survive restarts. `[DONE:n]` markers are re-scanned from conversation history on resume.

## Workflow

```
Normal ──(/plan)──→ Plan (read-only) ──(/execute_plan)──→ Execute ──→ Normal
                                                                  (all done or /plan)
```

1. **Toggle on** — `/plan` or `Ctrl+Alt+P` (or `pi --plan`)
2. **Explore & research** — read, grep, search safely. Destructive bash is blocked
3. **Ask & plan** — agent uses `plan_question` for clarity, then `plan_write` to persist a plan with phases, verification, and `⏸️ PAUSE` gates. Refine with `plan_edit`
4. **Execute** — `/execute_plan <name>` restores full tools, loads plan steps into a TUI progress widget. Run without a name for generic execution mode
5. **Track** — tag `[DONE:n]` per phase. Extension pauses at `⏸️` gates, auto-completes when all phases are done, and resets to normal mode

## Bash Safety

Dual-gate system: a command must **not** match 32 destructive patterns (`rm`, `mv`,
`sudo`, `npm install`, `git push`, pipe-to-interpreter, `curl -o`/`-d`, etc.) **and**
must match one of 48 safe patterns (`cat`, `grep`, `ls`, `git status`/`log`, `npm list`,
`curl` without destructive flags, etc.). Unknown commands are conservatively blocked.
See [AGENTS.md](AGENTS.md) for the full pattern list.

## Plan File Format

Plans live in `.pi/plans/` as markdown files with YAML frontmatter:

```markdown
---
title: "My Feature"
status: draft
created: "2026-01-15T12:00:00Z"
type: feature
---

# My Feature

## Overview
...

## Phase 1: Setup
`[DONE:1]` after completing.

⏸️ **PAUSE** — verify before Phase 2
```

## Development

```bash
npm install            # dev deps only (zero runtime dependencies)
npm run typecheck      # tsc --noEmit
npm run lint           # biome check .
npm test               # vitest — 204 tests across 10 test files
pi -e .                # load extension locally
```

Architecture details, release process, and gotchas in [AGENTS.md](AGENTS.md).

## License

MIT
