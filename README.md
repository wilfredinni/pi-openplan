# pi-openplan

> Plan mode extension for the [pi](https://pi.dev) Coding agent — read-only exploration with structured planning, plan files, and phased execution tracking.

**pi-openplan** adds a full-featured plan mode to pi, inspired by OpenCode's plan mode workflow. Toggle it on to safely explore codebases, research approaches, write structured plans, and then execute them phase by phase with progress tracking.

## Features

| Feature | Description |
|---|---|
| 🔒 **Read-only mode** | Restricts tools to read-only (read, grep, find, ls, safe bash). Blocks destructive commands via dual-gate safety (destructive + safe whitelist). |
| 📝 **Structured plans** | Save plans to `.pi/plans/` with YAML frontmatter (title, status, type, dates). Plans rendered inline in conversation on save. |
| 📋 **Plan file management** | LLM-callable tools: `plan_write`, `plan_read`, `plan_list` with status filtering and execution tracking. |
| ❓ **Interactive Q&A** | `plan_question` tool presents structured clarifying questions in a TUI overlay with options, multi-select, and free-text answers. |
| 🎯 **Progress tracking** | Mark plan steps complete with `[DONE:n]` tags — widget shows live progress. Session resume re-scans for completed markers. |
| ⏸️ **Pause points** | Detection of `⏸️ PAUSE` markers in plans for verification gates. Auto-pauses execution at each gate. |
| ⚡ **Token optimization** | System prompt reduced ~63% (→455 tokens). Caveman conciseness directive cuts output ~15–20%. Brief prompt variant on turns 2+. |
| 📊 **Token metrics** | `/tokens` command shows session + lifetime token usage. Footer displays per-turn overhead (`+{N}T`). Toggle with `/tokens-toggle`. |
| 🗜️ **Context compression** | `/compress-context` compresses .md/.txt files into caveman-speak, preserving code/URLs/paths. Original backed up as `.original.*`. |
| 🔄 **State persistence** | Plan mode state, todos, execution mode, and token metrics survive session restarts and `/reload`. |

## Installation

```bash
# From npm
pi install npm:pi-openplan

# From git
pi install git:github.com/wilfredinni/pi-openplan

# Local path (development)
pi install ./path/to/pi-openplan

# Try without installing (ephemeral)
pi -e ./path/to/pi-openplan
```

After installing, restart pi or run `/reload`.

## Quick Start

```bash
# Enable plan mode
/plan

# The LLM enters read-only mode and helps you research and plan
# When ready, it will write a plan with plan_write

# List saved plans
/plans

# Execute a saved plan (loads plan, enters execution mode, tracks progress)
/execute_plan my-plan-name

# Check token usage
/tokens

# Disable plan mode (back to full access)
/plan
```

## Commands

### `/plan`

Toggle plan mode on and off.

- **On**: Tools restricted to read-only (read, grep, find, ls, bash-safe, subagent, research, plan management). Destructive bash commands blocked via dual-gate safety (must not match destructive patterns AND must match known safe patterns).
- **Off**: Full access restored (`write` and `edit` re-enabled).

### `/plans`

List all saved plans from `.pi/plans/`. Shows filename, status, title, and creation date.

### `/execute_plan [plan-name]`

Exit plan mode and execute a saved plan. If a plan name is given, loads the plan content, extracts phases, and sets status to `in_progress`. Sends a concise execution instruction to the agent (token-efficient — tells agent to use `plan_read(full:true)` if full content needed).

```bash
# Execute a specific plan
/execute_plan add-rate-limiting

# Execute without a plan (generic execution mode)
/execute_plan
```

### `/tokens`

Show token usage metrics for plan mode. Displays session totals, lifetime totals, input overhead per source (system prompts, tool descriptions, plan content, tool responses), and output tokens.

```
Plan Mode Token Usage
──────────────────────────
This session:      1.2k tokens
All sessions:     34.5k tokens
──────────────────────────
Input overhead (per turn avg):
  system-prompt:     455 tokens
  tool-descriptions: 210 tokens
  plan-content:      180 tokens
```

### `/tokens-toggle`

Toggle showing per-turn token overhead in the footer status bar. When enabled, footer shows `⏸ plan +455T` indicating plan mode with token overhead per turn.

### `/compress-context [file]`

Compress a context file (default: `context.md`) into caveman-speak to save input tokens. Drops filler words, articles, and pleasantries while preserving code blocks, URLs, file paths, and inline code. Original backed up as `{file}.original.{ext}`. Only works on `.md`, `.txt`, `.typ`, `.tex` files.

```bash
# Compress default context.md
/compress-context

# Compress a specific file
/compress-context docs/architecture.md
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+P` | Toggle plan mode |

## CLI Flags

### `--plan`

Start pi in plan mode:

```bash
pi --plan
```

## Tools (LLM-callable)

These tools are registered for the LLM to use:

### `plan_write`

Save an implementation plan to `.pi/plans/`. Accepts `filename`, `title`, `content` (markdown), and optional `type` (feature, fix, refactor, chore). When saved, the plan is rendered inline in the conversation as a formatted markdown message with status, type, and date metadata.

```json
{
  "filename": "add-rate-limiting",
  "title": "Add Rate Limiting",
  "type": "feature",
  "content": "# Add Rate Limiting\n\n..."
}
```

### `plan_read`

Read a saved plan by filename or partial name. Supports fuzzy matching. Returns full content by default, or metadata-only when `full: false`.

```json
{
  "filename": "add-rate-limiting",
  "full": true
}
```

### `plan_list`

List all saved plans, optionally filtered by status (draft, approved, in_progress, done).

```json
{
  "status": "draft"
}
```

### `plan_question`

Present interactive clarifying questions to the user with predefined options. Supports single-select, multi-select, and custom free-text answers. Batch multiple related questions in one call (max 4). Returns the user's selected answers.

```json
{
  "questions": [
    {
      "question": "Which database should we use?",
      "header": "Database",
      "options": [
        { "label": "PostgreSQL", "description": "Relational, ACID compliant" },
        { "label": "SQLite", "description": "Embedded, zero config" }
      ],
      "multiSelect": false,
      "custom": true
    }
  ]
}
```

When called in interactive mode, the user sees a keyboard-navigable TUI overlay with numbered options, tab-based navigation for multiple questions, and an inline text editor for custom answers. In print mode, questions are returned as text for the LLM to make reasonable assumptions.

## Bash Safety

Plan mode uses a **dual-gate safety system** to block destructive commands:

1. **Destructive gate**: Blocks commands matching destructive patterns (rm, mv, npm install, git push, sudo, etc. — 30+ patterns)
2. **Safe gate**: Only allows commands matching known safe patterns (cat, grep, ls, git status, npm list, curl, etc. — 45+ patterns)

A command must pass BOTH gates to execute. Unknown commands (not in either list) are conservatively blocked.

Safe commands include read-only operations plus safe package manager queries (`npm list`, `yarn info`, `pip list`), git inspection (`git status`, `git log`), and HTTP fetch tools (`curl`, `wget -O -`).

## Token Optimization

pi-openplan uses a two-pronged token efficiency strategy:

### Input Optimization
- System prompt reduced from ~1,221 tokens to ~455 tokens (**63% reduction**)
- Brief ~200-token variant used on turns 2+ in the same plan-mode session
- Conciseness directive embedded directly (no separate skill/layer overhead)

### Output Optimization
- Caveman-style conciseness directive (~85 tokens) instructs the LLM to respond tersely
- Proven ~15–20% output reduction with zero accuracy loss
- Auto-escape hatch: drops terseness for security warnings, destructive actions, or when asked to clarify

### Metrics & Observability
- Token tracking uses `char/4` estimation (fast, no external deps)
- Per-category breakdown: system prompts, tool descriptions, plan content, tool responses, agent output
- Session + lifetime aggregation across restarts
- Footer status shows per-turn overhead when toggled on

Research basis: [caveman](https://github.com/JuliusBrussee/caveman) (65% avg output reduction), [caveman-micro](https://github.com/kuba-guzik/caveman-micro) (6-line variant outperforms full skill), [arxiv.org/abs/2604.00025](https://arxiv.org/abs/2604.00025) (brevity constraints improved accuracy by 26 points).

## Plan File Format

Plans are stored as markdown files in `.pi/plans/` with YAML frontmatter:

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

### Plan Metadata

| Field | Values |
|---|---|
| `status` | `draft`, `approved`, `in_progress`, `done` |
| `type` | `feature`, `fix`, `refactor`, `chore` |
| `created` | ISO timestamp |
| `updated` | ISO timestamp (optional) |

### Progress Tracking

During execution mode, include `[DONE:n]` in your responses where `n` matches the phase number. The widget updates automatically showing completed vs remaining steps. On session resume, the extension re-scans all messages after the `/execute_plan` command for `[DONE:n]` markers to restore progress state.

### Pause Points

Include `⏸️ PAUSE` or `PAUSE` in your plan to create verification gates. The extension will automatically pause and ask for confirmation before continuing to the next phase.

## Plan Mode Workflow

1. **Toggle on**: `/plan` or `Ctrl+Alt+P`
2. **Explore**: Read files, search code, research approaches (all read-only, bash dual-gate safety)
3. **Ask**: Use `plan_question` to clarify scope, constraints, and priorities
4. **Plan**: The LLM creates a structured plan using `plan_write` with phases, verification steps, and risks — plan renders inline in conversation
5. **Review**: The LLM presents the plan summary and stops — no prompts or choices
6. **Execute**: Use `/execute_plan <plan-name>` to load the plan and begin phased execution
7. **Track**: Use `[DONE:n]` to mark steps complete; the widget shows progress; footer shows token overhead
8. **Verify**: At each ⏸️ pause point, review before continuing
9. **Complete**: When all steps are done, the extension announces completion and resets execution mode
10. **Monitor**: Use `/tokens` to see how many tokens plan mode consumed

## Architecture

The extension is organized into 9 focused modules under `extensions/plan-mode/`:

| Module | Responsibility |
|---|---|
| `index.ts` | Orchestrator — extension entry point, registers all modules |
| `state.ts` | Shared typed state (`PlanModeState`), tool sets, todo extraction, message helpers |
| `commands.ts` | Command handlers: `/plan`, `/plans`, `/execute_plan`, `/tokens`, `/tokens-toggle`, `/compress-context` |
| `events.ts` | Event handlers: bash safety, prompt injection, DONE tracking, completion/pause, session restore, context filtering |
| `tools.ts` | Tool registrations: `plan_write`, `plan_read`, `plan_list` |
| `question-prompt.ts` | Interactive `plan_question` tool with TUI overlay |
| `prompts.ts` | System prompts (full + brief), conciseness directive, execution mode prompt, plan template |
| `token-metrics.ts` | Token estimation, collection, lifetime aggregation, report formatting |
| `bash-safety.ts` | Dual-gate command safety (destructive patterns + safe patterns) |
| `plan-files.ts` | CRUD operations for `.pi/plans/`, frontmatter parsing, text compression |

## Development

```bash
# Clone
git clone https://github.com/wilfredinni/pi-openplan
cd pi-openplan

# Install dev dependencies
npm install

# Type check
npm run typecheck

# Test locally
pi -e .

# Try a specific test
echo "list tools" | pi -e . -p
```

## Publishing

```bash
# Build the tarball
npm pack

# Publish to npm
npm publish

# Or as scoped package
npm publish --access public
```

## Requirements

- [pi](https://pi.dev) 0.74.0 or later

## License

MIT
