# Code Context — pi-openplan

## Overview

**pi-openplan** is a pi extension (v1.0.0) that adds a read-only plan mode to pi, inspired by OpenCode's plan mode workflow. It's a TypeScript ESM package with **4 source files** in `extensions/plan-mode/`. The extension toggles tool access between read-only (plan/research) and full access (execution), persists structured plan files to `.pi/plans/`, provides an interactive TUI question system, and tracks phased execution with `[DONE:n]` markers.

---

## 1. Project Structure

```
pi-openplan/
├── .git/
├── .github/
│   └── workflows/
│       ├── ci.yml              — Type check + lint on push/PR
│       └── release.yml         — release-please + npm publish
├── .gitignore                  — node_modules, .pi/plans/, dist/, .DS_Store, *.log
├── .pi/
│   └── plans/                  — Saved plan markdown files (gitignored)
│       ├── 2026-05-28-add-name-to-readme.md
│       └── 2026-05-28-interactive-plan-questions.md
├── extensions/
│   └── plan-mode/
│       ├── index.ts            — Main extension entry point (all commands, tools, events, state)
│       ├── plan-files.ts       — Plan file CRUD (create, read, list, updateStatus, slugify)
│       ├── prompts.ts          — System prompts + plan template
│       └── questions.ts        — PlanQuestionPrompt TUI component + types
├── node_modules/
├── CHANGELOG.md
├── LICENSE                     — MIT
├── README.md
├── package.json
├── package-lock.json
└── tsconfig.json
```

**Key directories:**
- `extensions/plan-mode/` — the only extension bundle (4 `.ts` files)
- `.pi/plans/` — where saved plan files live (gitignored)
- `.github/workflows/` — CI (type-check, lint) + Release (release-please, npm publish)

---

## 2. Question Tool (`plan_question`)

**Yes, there is a question tool.** It's defined in `extensions/plan-mode/questions.ts` and registered in `extensions/plan-mode/index.ts`.

### Location
- **Types + TUI Component**: `extensions/plan-mode/questions.ts` (529 lines)
- **Tool Registration + Execution**: `extensions/plan-mode/index.ts` lines ~498-620

### How it works

The LLM calls `plan_question` with structured questions:

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

### Constants (questions.ts:13-16)
```typescript
export const MAX_QUESTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_HEADER_LENGTH = 12;
```

### TUI Component: `PlanQuestionPrompt` (questions.ts:44-529)

A keyboard-navigable overlay rendered via `ctx.ui.custom()` with the following modes:

| Mode | Behavior |
|---|---|
| **Single question, single-select** | Numbered list, ↑↓/1-9 to pick, Enter to select, auto-submits |
| **Single question, multi-select** | Checkboxes `[✓]`/`[ ]`, ↑↓ to move, Enter to toggle, Esc to confirm |
| **Multiple questions** | Tab bar with header labels, Tab/Shift+Tab or ←→ to switch, Review tab before submit |
| **Custom answer** | "Type your own answer" option, inline text input, Enter to submit |
| **Review tab** | Shows all answers with ✓/✗ indicators, Enter to submit all, Esc to cancel |

### Key methods
- `handleInput(data: string)` — keyboard dispatch (questions.ts:113-241)
- `render(width: number)` — returns array of TUI lines (questions.ts:344-529)
- `renderQuestionTab()` — renders options list for one question (questions.ts:403-498)
- `renderReviewTab()` — renders all answers before submit (questions.ts:503-529)
- `selectCurrentOption()` — pick/toggle/start-editing (questions.ts:246-273)
- `toggleAnswer()` — multi-select toggle (questions.ts:288-295)
- `tryAdvance()` — advance to next tab or submit (questions.ts:300-315)

### Tool execution flow (index.ts)
1. Validate input (empty question, empty header, header too long)
2. If interactive (`ctx.hasUI && ctx.ui.custom`): launch `PlanQuestionPrompt`, await results
3. If non-interactive (print/JSON mode): return questions as text for LLM to make assumptions
4. Returns answers as `string[][]` or `{ dismissed: true }` on Esc

---

## 3. UI-Related Files & Styling

### There are NO CSS files. This is a terminal/TUI application.

All UI is rendered via **pi's TUI SDK** (`@earendil-works/pi-tui`). The styling system uses a theme object with color names:

### Theme API (pervasive across code)
```typescript
// From questions.ts:60-66
theme: {
    fg: (color: ThemeColor, text: string) => string;
    bold: (text: string) => string;
}
```

### Theme colors used throughout:
| Color | Usage |
|---|---|
| `"accent"` | Selected options, active tab, > cursor |
| `"success"` | Completed todos (✓), selected answers |
| `"warning"` | Plan mode status (⏸), unanswered items, partial state |
| `"muted"` | Completed todo text, option descriptions |
| `"dim"` | Help bar text, unselected tabs |
| `"text"` | Normal question/option text |
| `"border"` | Box-drawing characters (╭─╮, ╰─╯) |

### UI rendering patterns in questions.ts
```
╭─────────────────────────────────────────────╮  ← border
│ [Database] [Auth] [Deploy] [Review]         │  ← tab bar
│                                             │
│ Which database should we use?               │  ← question text
│                                             │
│   1. PostgreSQL — Relational, ACID compliant│  ← options
│ > 2. SQLite — Embedded, zero config        │  ← selected (accent)
│   3. MongoDB — Document store, flexible     │
│   4. Type your own answer                   │  ← custom option
│                                             │
│ ⇆ tab  ↑↓ select  1-4 pick  enter next    │  ← help bar
╰─────────────────────────────────────────────╯  ← border
```

### UI Components in index.ts
1. **Footer status** (`ctx.ui.setStatus("plan-mode", ...)`) — lines 307-317
   - Plan mode: `"⏸ plan"` (warning color)
   - Execution: `"📋 N/M"` (accent color)
2. **Plan progress widget** (`ctx.ui.setWidget("plan-todos", ...)`) — lines 320-343
   - Completed: `"✓ "` (success) + strikethrough text (muted)
   - Pending: `"○ "` (muted) + text (accent)
3. **Custom message renderer** (`pi.registerMessageRenderer("plan-content", ...)`) — lines 288-296
   - Renders plan content via `Markdown` component from pi-tui
4. **Notifications** (`ctx.ui.notify(...)`) — used for command feedback, errors, warnings

---

## 4. Margin/Padding/Styling Patterns

### There is no CSS margin/padding — all layout is done with text characters in the TUI.

Key patterns found:

### Padding (questions.ts:351)
```typescript
const contentWidth = width - 4; // 2 chars padding each side
```
All content is padded with 2 characters on each side (a leading `│ ` and trailing ` │`).

### Border characters (questions.ts:355, 395)
- Top: `╭` + repeated `─` + `╮`
- Bottom: `╰` + repeated `─` + `╯`

### Truncation pattern (used throughout questions.ts)
```typescript
`│ ${truncateToWidth(someText, contentWidth)} │`
```
All lines are truncated to fit within the content width. `truncateToWidth` is imported from `@earendil-works/pi-tui`.

### Spacer lines (questions.ts:390-391, 422-423)
```typescript
lines.push(`│${" ".repeat(Math.max(0, width - 2))}│`);
```
Empty lines use `" ".repeat()` for padding.

### Indentation for descriptions (questions.ts:447-451)
```typescript
const descStyle = isSelected
    ? t.fg("muted", `   ${t.fg("accent", opt.description)}`)    // 3 spaces indent
    : t.fg("muted", `   ${opt.description}`);
```

### Help bar (questions.ts:494-497)
```typescript
lines.push(`│ ${truncateToWidth(`  ${help}`, contentWidth)} │`); // 2-space indent
```

### Markdown rendering (index.ts:291-293)
```typescript
const mdTheme = getMarkdownTheme();
const md = new Markdown(rawContent, 1, 0, mdTheme);
//                                ^  ^-- left margin: 0
//                                |---- top margin: 1
```

---

## 5. Tech Stack

| Layer | Technology |
|---|---|
| **Language** | TypeScript (ES2022, strict mode) |
| **Module system** | ESM (`"type": "module"` in package.json) |
| **Module resolution** | bundler (tsconfig.json) |
| **Runtime** | Node.js (pi runs on Node) |
| **UI Framework** | **Terminal/TUI** — not a web browser, no React/DOM |
| **TUI library** | `@earendil-works/pi-tui` (Markdown, Key, truncateToWidth) |
| **Agent SDK** | `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent` |
| **Schema validation** | TypeBox (`typebox` v1.1.0+) |
| **Linting/formatting** | Biome (`@biomejs/biome` v2.4.0) |
| **CI** | GitHub Actions (type-check + lint, release-please) |
| **Publishing** | npm (with provenance) |

### Rendering is entirely TUI/terminal-based:
- `Markdown` component renders markdown as styled terminal output
- `ctx.ui.custom()` renders custom overlay components (like PlanQuestionPrompt)
- `ctx.ui.setStatus()` renders footer status bar
- `ctx.ui.setWidget()` renders sidebar widgets (plan todos)
- `ctx.ui.notify()` shows notifications
- `ctx.ui.theme.fg(color, text)` applies terminal colors

### Dependencies (peer, v0.74.0 minimum):
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

---

## 6. Key Architectural Patterns

### State Machine
```
Normal Mode ←→ Plan Mode (read-only) → Execution Mode → Normal Mode
```

### State persisted across restarts via `pi.appendEntry("plan-mode-v2", ...)`

### Tool restriction via regex
- 32 `DESTRUCTIVE_PATTERNS` (rm, mv, git commit, npm install, etc.)
- 34 `SAFE_PATTERNS` (cat, grep, find, ls, git status, etc.)

### 3 Commands
- `/plan` — toggle plan mode
- `/plans` — list saved plans
- `/execute_plan [name]` — enter execution mode with optional plan

### 4 LLM-callable Tools
- `plan_write` — save a plan
- `plan_read` — read a plan
- `plan_list` — list plans
- `plan_question` — interactive clarifying questions

### 6 Events Hooked
- `tool_call` — blocks destructive bash
- `before_agent_start` — injects system prompts
- `turn_end` — tracks [DONE:n] markers
- `agent_end` — completion detection, pause points, todo extraction
- `session_start` — state restoration, --plan flag
- `context` — filters stale plan-mode context

---

## Start Here

Open **`extensions/plan-mode/index.ts`** — the 600+ line main entry point containing the `planModeExtension` default export function. All state, commands, tools, events, and UI logic are registered here.

For the question tool TUI specifically: **`extensions/plan-mode/questions.ts`** — the `PlanQuestionPrompt` class with keyboard handling and terminal rendering.
