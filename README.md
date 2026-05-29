# pi-openplan

> Plan mode extension for [pi](https://pi.dev) — read-only exploration with structured planning, plan files, and phased execution tracking.

**pi-openplan** adds a full-featured plan mode to pi, inspired by OpenCode's plan mode workflow. Toggle it on to safely explore codebases, research approaches, write structured plans, and then execute them phase by phase with progress tracking, revision loops, phase skip/retry, execution resume, memory bank context, plan history, and cross-plan dependency tracking.

## Features

| Feature | Description |
|---|---|
| 🔒 **Read-only mode** | Restricts tools to read-only (read, grep, find, ls, safe bash). Blocks destructive commands. |
| 📝 **Structured plans** | Save plans to `.pi/plans/` with YAML frontmatter (title, status, type, version, dependencies). |
| 📋 **Plan file management** | LLM-callable tools: `plan_write`, `plan_read`, `plan_list` with status filtering. |
| ❓ **Interactive Q&A** | `plan_question` tool presents structured clarifying questions in a TUI overlay with options, multi-select, and free-text answers. |
| 🎯 **Progress tracking** | Mark plan steps with `[DONE:n]`, `[SKIP:n]`, `[FAIL:n]`, or `[START:n]` — widget shows live progress bar with phase status icons. |
| ⏸️ **Pause points** | Detection of `⏸️ PAUSE` markers in plans for verification gates. |
| 🔄 **State persistence** | Plan mode state, todos, and execution mode survive session restarts and `/reload`. |
| ✏️ **Plan revision** | `/plan_revise <name>` loads an existing plan and re-enters plan mode to revise it. Version tracking built in. |
| 📝 **Plan amendment** | `/plan_amend` pauses execution to modify remaining phases mid-flight. |
| ⏩ **Phase skip/retry** | `/plan_skip <n>` skip a phase, `/plan_retry <n>` reset a phase to try again. |
| ▶️ **Execution resume** | `/plan_resume [name]` resumes execution from the last incomplete phase. |
| 🧠 **Memory Bank** | Persistent context files (`context.md`, `system-patterns.md`, `progress.md`) auto-injected in plan mode. |
| 📜 **Plan history** | `plan_history` tool lists version history for any plan. |
| 🔗 **Plan dependencies** | `/plan_deps` shows dependency graph between plans. |
| 🤖 **Model-aware planning** | `/plan_models` configures separate models for plan and execute modes. |

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

# Disable plan mode (back to full access)
/plan
```

## Commands

### `/plan`

Toggle plan mode on and off.

- **On**: Tools restricted to read-only (read, grep, find, ls, bash-safe, subagent, research, plan management). Destructive bash commands blocked.
- **Off**: Full access restored.

### `/plans`

List all saved plans from `.pi/plans/`. Shows filename, status, title, and creation date.

### `/plan_revise <name>`

Load an existing plan and re-enter plan mode to revise it. The agent gets the current plan content and a revision prompt. Version is auto-incremented in the frontmatter.

### `/plan_amend`

Pause the current execution and modify the remaining phases. Shows completion status of all phases. The agent can add, remove, reorder, or modify remaining phases. After saving with `plan_write`, execution resumes from the first incomplete phase.

### `/plan_resume [name]`

Resume execution of an incomplete plan. If a plan name is provided, load it and resume from the first incomplete phase. Shows current status of all phases.

### `/plan_skip <n>`

Skip a phase by number. Marks the phase as skipped and continues. The widget updates immediately.

### `/plan_retry <n>`

Reset a failed or skipped phase back to pending for retry. **Note**: this only resets the tracking state — code changes from the original attempt are not reverted (use `git restore` for that).

### `/plan_models plan=<model> execute=<model>`

Configure separate models for plan mode and execution mode. Example: `/plan_models plan=claude-opus-4 execute=claude-sonnet-4`.

### `/plan_deps`

Show the dependency graph of all plans. Plans with `depends_on` or `blocks` in their frontmatter are shown with their relationships.

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

Save an implementation plan to `.pi/plans/`. Accepts `filename`, `title`, `content` (markdown), and optional `type` (feature, fix, refactor, chore).

```json
{
  "filename": "add-rate-limiting",
  "title": "Add Rate Limiting",
  "type": "feature",
  "content": "# Add Rate Limiting\n\n..."
}
```

### `plan_read`

Read a saved plan by filename or partial name.

```json
{
  "filename": "add-rate-limiting"
}
```

### `plan_list`

List all saved plans, optionally filtered by status (draft, approved, in_progress, done).

```json
{
  "status": "draft"
}
```

### `plan_history`

List version history for a plan. Shows all saved versions with timestamps.

```json
{
  "filename": "add-rate-limiting"
}
```

### `memory_read`

Read a memory bank file (`context.md`, `system-patterns.md`, `progress.md`) from the project root. If no filename is provided, lists all available memory bank files with their sizes.

```json
{
  "filename": "context.md"
}
```

### `memory_write`

Write or update a memory bank file in the project root. Use for persisting project context across sessions.

```json
{
  "filename": "context.md",
  "content": "# Project Context\n\n## Goals\n..."
}
```

### `plan_question`

Present interactive clarifying questions to the user with predefined options. Supports single-select, multi-select, and custom free-text answers. Batch multiple related questions in one call. Returns the user's selected answers.

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
| `version` | Integer (auto-incremented on revision) |
| `previousVersion` | String, reference to the previous version file |
| `depends_on` | Comma-separated plan filenames this plan depends on |
| `blocks` | Comma-separated plan filenames that depend on this plan |

### Progress Tracking

During execution mode, include status tags in your responses where `n` matches the phase number:

| Tag | Effect |
|---|---|
| `[DONE:n]` | Marks phase as completed |
| `[SKIP:n]` | Marks phase as skipped |
| `[FAIL:n]` | Marks phase as failed |
| `[START:n]` | Marks phase as in progress |

The widget updates automatically showing a progress bar (`[████░░░░] 3/5`) and per-phase status icons (✓ done, ⟳ in progress, ✗ failed, ⏭ skipped, ○ pending).

### Pause Points

Include `⏸️ PAUSE` or `PAUSE` in your plan to create verification gates. The extension will automatically pause and ask for confirmation before continuing to the next phase.

## Plan Mode Workflow

1. **Toggle on**: `/plan` or `Ctrl+Alt+P`
2. **Explore**: Read files, search code, research approaches (all read-only)
3. **Plan**: The LLM creates a structured plan using `plan_write` with phases, verification steps, and risks
4. **Revise** (optional): Use `/plan_revise <name>` to iterate on the plan
5. **Execute**: Use `/execute_plan <name>` to start execution
6. **Amend** (optional): Use `/plan_amend` to modify remaining phases mid-execution
7. **Track**: Use `[DONE:n]`, `[SKIP:n]`, `[FAIL:n]`, `[START:n]` to mark phase status; the widget shows a progress bar and status icons
8. **Resume**: If interrupted, use `/plan_resume` to pick up where you left off
9. **Skip/Retry**: Use `/plan_skip <n>` or `/plan_retry <n>` to control individual phases
10. **Verify**: At each ⏸️ pause point, review before continuing
11. **Complete**: When all steps are done, the extension announces completion

## Memory Bank

Memory Bank files provide persistent context across sessions. Place these markdown files in your project root:

| File | Purpose |
|---|---|
| `context.md` | Project goals, active context, decisions |
| `system-patterns.md` | Architecture, design patterns, conventions |
| `progress.md` | Progress tracking across sessions |

The LLM can read and write these files using the `memory_read` and `memory_write` tools. When plan mode is active, any existing memory bank files are auto-injected into the system prompt so the agent starts every session with full context.

## Custom Plan Template

Place a custom plan template at `.pi/plan-template.md` in your project root to override the default template format. The template can use `$TITLE`, `$CREATED`, and `$PHASES` placeholders. When a custom template exists, the agent is instructed to use it when writing plans.

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
