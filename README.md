# pi-openplan

> Plan mode extension for [pi](https://pi.dev) — read-only exploration with structured planning, plan files, and phased execution tracking.

**pi-openplan** adds a full-featured plan mode to pi, inspired by OpenCode's plan mode workflow. Toggle it on to safely explore codebases, research approaches, write structured plans, and then execute them phase by phase with progress tracking.

## Features

| Feature | Description |
|---|---|
| 🔒 **Read-only mode** | Restricts tools to read-only (read, grep, find, ls, safe bash). Blocks destructive commands. |
| 📝 **Structured plans** | Save plans to `.pi/plans/` with YAML frontmatter (title, status, type, dates). |
| 📋 **Plan file management** | LLM-callable tools: `plan_write`, `plan_read`, `plan_list` with status filtering. |
| 🎯 **Progress tracking** | Mark plan steps complete with `[DONE:n]` tags — widget shows live progress. |
| ⏸️ **Pause points** | Detection of `⏸️ PAUSE` markers in plans for verification gates. |
| 🔄 **State persistence** | Plan mode state, todos, and execution mode survive session restarts and `/reload`. |

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

During execution mode, include `[DONE:n]` in your responses where `n` matches the phase number. The widget updates automatically showing completed vs remaining steps.

### Pause Points

Include `⏸️ PAUSE` or `PAUSE` in your plan to create verification gates. The extension will automatically pause and ask for confirmation before continuing to the next phase.

## Plan Mode Workflow

1. **Toggle on**: `/plan` or `Ctrl+Alt+P`
2. **Explore**: Read files, search code, research approaches (all read-only)
3. **Plan**: The LLM creates a structured plan using `plan_write` with phases, verification steps, and risks
4. **Review**: The LLM presents the plan summary and stops — no prompts or choices
5. **Toggle off**: Use `/plan` to disable plan mode when ready to execute
6. **Execute**: Ask the agent to implement the plan
7. **Track**: Use `[DONE:n]` to mark steps complete; the widget shows progress
8. **Verify**: At each ⏸️ pause point, review before continuing
9. **Complete**: When all steps are done, the extension announces completion

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
