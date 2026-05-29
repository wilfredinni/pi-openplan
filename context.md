# Code Context — pi-openplan

## Overview

**pi-openplan** is a pi extension (v1.0.0) that adds a read-only plan mode to pi, inspired by OpenCode's plan mode workflow. It's a single TypeScript package with three source files. The extension toggles tool access between read-only (plan/research) and full access (execution), persists structured plan files to `.pi/plans/`, tracks phased execution with `[DONE:n]` markers, and provides TUI widgets for progress visualization.

---

## Files Retrieved

### 1. `extensions/plan-mode/index.ts` (507 lines) — Main extension entry point
The entire extension lives here. Registers commands, tools, events, keyboard shortcuts, and manages state.

### 2. `extensions/plan-mode/plan-files.ts` (175 lines) — Plan file CRUD utilities
Filesystem operations for `.pi/plans/` directory: create, read, list, update status, update content, with YAML frontmatter parsing/serialization.

### 3. `extensions/plan-mode/prompts.ts` (164 lines) — System prompts + plan template
Three exports: `PLAN_MODE_SYSTEM_PROMPT` (injected during plan mode), `EXECUTION_MODE_PROMPT` (injected during execution), and `PLAN_TEMPLATE` (reference template for plan format).

### 4. SDK Type Definitions (read for API surface):
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` — ExtensionAPI, ExtensionContext, ExtensionUIContext, ToolDefinition, all event types
- `node_modules/@earendil-works/pi-tui/dist/keys.d.ts` — Key enum for keyboard shortcuts
- `node_modules/@earendil-works/pi-tui/dist/keybindings.d.ts` — Built-in keybinding registry
- `node_modules/@earendil-works/pi-tui/dist/components/markdown.d.ts` — Markdown component for rendering plan content
- `node_modules/@earendil-works/pi-ai/dist/types.d.ts` — AssistantMessage, TextContent, ToolCall types
- `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts` — AgentMessage, AgentToolResult, AgentToolUpdateCallback
- `node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts` — createAgentSession and re-exports

### 5. `package.json` — Project config
ESM module, peer dependencies on pi packages v0.74.0+. Extension path: `./extensions`.

### 6. `tsconfig.json` — TypeScript config
Target ES2022, module bundler resolution, strict mode, noEmit.

---

## Architecture

### State Machine
```
Normal Mode ←→ Plan Mode (read-only) → Execution Mode → Normal Mode (or Plan Mode)
```

- **Normal Mode**: Full tools (read, write, edit, bash unrestricted)
- **Plan Mode**: Read-only tools + plan management tools. Bash is restricted via regex patterns. System prompt injected.
- **Execution Mode**: Full tools restored. Plan progress tracked via `[DONE:n]` markers. Pause points (`⏸️ PAUSE`) trigger verification gates.

State persists across session restarts via `appendEntry("plan-mode-v2", ...)` custom session entries.

### Tool Sets
- **PLAN_MODE_TOOLS**: read, grep, find, ls, bash (safe), subagent, web_search, fetch_content, code_search, get_search_content, ctx_execute, ctx_execute_file, ctx_search, ctx_batch_execute, ctx_index, ctx_fetch_and_index, plan_write, plan_read, plan_list
- **NORMAL_MODE_TOOLS**: PLAN_MODE_TOOLS + edit + write

### Bash Safety in Plan Mode
Two regex lists: `DESTRUCTIVE_PATTERNS` (32 patterns covering rm, mv, git add/commit/push, npm install, etc.) and `SAFE_PATTERNS` (34 patterns covering cat, grep, find, ls, git status/log/diff, etc.). A command is safe if it matches at least one safe pattern AND no destructive pattern.

### Events Hooked
| Event | Purpose |
|---|---|
| `tool_call` | Blocks destructive bash in plan mode |
| `before_agent_start` | Injects system prompts (plan mode or execution mode) |
| `turn_end` | Scans assistant messages for `[DONE:n]` markers, updates progress |
| `agent_end` | Detects plan completion, pause points, extracts todo items from plan text |
| `session_start` | Restores persisted state, handles `--plan` flag, re-scans messages for DONE markers |
| `context` | Filters plan-mode context messages when not in plan mode |

### Three LLM-callable Tools
1. **plan_write** — Saves a plan to `.pi/plans/`. Renders the plan as a styled Markdown message in the conversation. Auto-slugifies filename with date prefix.
2. **plan_read** — Reads a plan by filename/partial name. Returns metadata + content.
3. **plan_list** — Lists plans, optionally filtered by status (draft/approved/in_progress/done).

### Three Commands
1. **`/plan`** — Toggle plan mode on/off
2. **`/plans`** — List saved plans in a notification
3. **`/execute_plan [name]`** — Exit plan mode, enter execution mode, optionally load a plan. Sends the plan content as a user message to the LLM.

### Keyboard Shortcut
- `Ctrl+Alt+P` — Toggle plan mode (`Key.ctrlAlt("p")`)

### CLI Flag
- `--plan` — Start pi in plan mode (boolean flag)

### UI Components
- **Footer status**: `ctx.ui.setStatus("plan-mode", ...)` — shows `⏸ plan` or `📋 N/M` progress
- **Plan progress widget**: `ctx.ui.setWidget("plan-todos", lines)` — shows plan steps with ✓/○ markers and strikethrough for completed
- **Custom message renderer**: `pi.registerMessageRenderer("plan-content", ...)` — renders plan files as styled Markdown via the `Markdown` component from pi-tui
- **Notifications**: `ctx.ui.notify(...)` — for command feedback and status changes

### Plan File Format
Markdown files in `.pi/plans/` with YAML frontmatter:
```yaml
title: string
status: draft | approved | in_progress | done
created: ISO timestamp
updated?: ISO timestamp
type: feature | fix | refactor | chore
```

### Progress Tracking
- `[DONE:n]` tags in assistant messages mark plan steps as complete
- Widget updates live showing completed/total
- `⏸️ PAUSE` markers trigger pause notifications
- Steps are auto-extracted from plan text using regex for `Phase N` headers or numbered lists

### State Persistence
- State saved to session via `pi.appendEntry("plan-mode-v2", { enabled, todos, executing })`
- On `session_start`, state restored from last `plan-mode-v2` entry
- On resume, all messages since last `plan-mode-execute` entry are re-scanned for DONE markers

### Context Filtering
When NOT in plan mode, the `context` event handler filters out plan-mode system prompt messages to keep context clean.

---

## Key SDK APIs Used

### ExtensionAPI (pi.*)
- `pi.registerCommand(name, { description, handler })`
- `pi.registerTool({ name, label, description, parameters, execute })`
- `pi.registerFlag(name, { description, type, default })`
- `pi.registerShortcut(keyId, { description, handler })`
- `pi.registerMessageRenderer(customType, renderer)`
- `pi.on(event, handler)` — subscribed to: `tool_call`, `before_agent_start`, `turn_end`, `agent_end`, `session_start`, `context`
- `pi.setActiveTools(toolNames[])`
- `pi.getActiveTools()`
- `pi.getFlag(name)`
- `pi.sendMessage(message, options)`
- `pi.sendUserMessage(content, options)`
- `pi.appendEntry(customType, data)`

### ExtensionContext (ctx.*)
- `ctx.ui.setStatus(key, text)`
- `ctx.ui.setWidget(key, lines | factory)`
- `ctx.ui.notify(message, type)`
- `ctx.cwd`
- `ctx.sessionManager.getEntries()`
- `ctx.hasUI`

### pi-tui (imported)
- `Key` — typed key identifier helpers (Key.ctrlAlt("p"), Key.ctrl("c"), etc.)
- `Markdown` — renders markdown text as TUI components with theming
- `getKeybindings()` — access global keybinding manager

### pi-coding-agent (imported)
- `getMarkdownTheme()` — returns the current theme's markdown styling
- `parseFrontmatter(content)` — parses YAML frontmatter from markdown strings

### pi-ai / pi-agent-core (types only)
- `AssistantMessage`, `AgentMessage`, `TextContent`, `AgentToolResult`, `AgentToolUpdateCallback`

---

## Start Here

Open **`extensions/plan-mode/index.ts`** — it contains the entire extension logic. The `planModeExtension` function is the default export and receives the `ExtensionAPI` (`pi`) object. All state, commands, tools, and event handlers are registered inside this single function.

## Files to Modify (likely targets for changes)
- `extensions/plan-mode/index.ts` — main logic, UI, state, events
- `extensions/plan-mode/prompts.ts` — system prompt text for plan mode and execution mode
- `extensions/plan-mode/plan-files.ts` — plan file storage format and operations
