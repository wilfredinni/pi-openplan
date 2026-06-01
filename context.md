# Code Context — pi-openplan

## 1. Full Directory Tree

```
pi-openplan/
├── .github/workflows/
│   ├── ci.yml                    # Typecheck + lint on push/PR
│   └── release.yml               # release-please + npm publish (OIDC)
├── .pi/plans/                    # 12 existing plan .md files (gitignored)
├── extensions/plan-mode/         # All source: 9 .ts files, 2,219 total lines
│   ├── index.ts                  (169 lines) — Orchestrator / entry point
│   ├── state.ts                  (175 lines) — Shared state, types, toolsets
│   ├── commands.ts               (114 lines) — CLI commands (/plan, /plans, /execute_plan)
│   ├── events.ts                 (285 lines) — 6 event hooks
│   ├── tools.ts                  (246 lines) — plan_write, plan_read, plan_list
│   ├── question-prompt.ts        (748 lines) — plan_question TUI overlay
│   ├── prompts.ts                (136 lines) — System prompts + template
│   ├── bash-safety.ts            (120 lines) — Dual-gate bash safety guard
│   └── plan-files.ts             (226 lines) — CRUD for .pi/plans/ + frontmatter
├── package.json                  # version 1.4.0, type: "module"
├── tsconfig.json                 # target: ES2022, moduleResolution: "bundler"
├── AGENTS.md                     # Dev instructions
├── README.md
├── LICENSE (MIT)
├── CHANGELOG.md
└── .gitignore
```

## 2. All TypeScript Source Files — Purposes & Exports

### `index.ts` (169 lines) — Orchestrator
- **Default export:** `planModeExtension(pi: ExtensionAPI): void`
- **Imports from:** `commands.ts`, `events.ts`, `question-prompt.ts`, `state.ts`, `tools.ts`
- **Registers:** message renderer (`plan-content`), CLI flag (`--plan`), shortcut (`Ctrl+Alt+P`), commands, tools, events
- **Creates** `PlanModeState` and `PlanModeCallbacks` (with `updateUI`, `persistState`, `togglePlanMode`, `enterPlanMode`, `exitPlanMode`)

### `state.ts` (175 lines) — Shared State & Types
- **Named exports:**
  - `PLAN_MODE_TOOLS: string[]` — 20 read-only/plan tools
  - `NORMAL_MODE_TOOLS: string[]` — same + `"edit"`, `"write"`
  - `TodoItem` interface — `{step, text, completed}`
  - `PlanModeState` interface — `{planModeEnabled, executionMode, todoItems, planModeTurnCount}`
  - `PlanModeCallbacks` interface — 5 callback functions
  - `createInitialState(): PlanModeState`
  - `isAssistantMessage(m): boolean` — type guard
  - `getTextContent(message): string` — extract text blocks
  - `extractTodosFromPlan(message): TodoItem[]` — parse phases/plan steps
  - `extractDoneSteps(text): number[]` — regex `[DONE:n]`
  - `markCompletedSteps(text, items): number` — marks items & returns count
- **No imports from sibling modules** (leaf node in dependency graph)

### `commands.ts` (114 lines) — Command Registrations
- **Named export:** `registerCommands(pi, state, callbacks): void`
- **Registers 3 commands:**
  - `/plan` — toggles plan mode via callbacks
  - `/plans` — lists saved plans from file system
  - `/execute_plan [name?]` — exits plan mode, enters execution mode, loads plan, sends user message
- **Imports from:** `plan-files.ts`, `state.ts`

### `events.ts` (285 lines) — Event Handlers
- **Named export:** `registerEvents(pi, state, callbacks): void`
- **Registers 6 event hooks:**
  1. `tool_call` — bash safety gate (checks commands against `bash-safety.ts`)
  2. `before_agent_start` — injects plan/execution system prompts; brief prompt on turns 2+
  3. `turn_end` — scans for `[DONE:n]` markers, updates todoItems, persists state
  4. `agent_end` — completion detection, pause-point detection (`⏸`/`PAUSE`), plan step extraction from messages
  5. `session_start` — restores persisted state, re-scans messages for DONE markers on resume, applies tool restrictions
  6. `context` — filters stale plan-mode context messages when not in plan mode
- **Imports from:** `bash-safety.ts`, `prompts.ts`, `state.ts`

### `tools.ts` (246 lines) — Plan Management Tools
- **Named export:** `registerTools(pi): void`
- **Registers 3 tools:**
  - `plan_write` — saves plan to `.pi/plans/`, renders inline, uses TypeBox schema
  - `plan_read` — reads plan by filename (fuzzy match), returns metadata or full content
  - `plan_list` — lists plans, optional status filter
- **Imports from:** `plan-files.ts`, `@earendil-works/pi-coding-agent` (parseFrontmatter), `typebox`

### `question-prompt.ts` (748 lines) — Interactive Q&A
- **Named exports:**
  - `PlanQuestionPrompt` class — full TUI overlay component (tabs, options, multi-select, custom text editing, review tab)
  - `registerPlanQuestionTool(pi): void` — registers `plan_question` tool
  - `MAX_QUESTIONS = 4`, `MIN_OPTIONS = 2`, `MAX_OPTIONS = 4`, `MAX_HEADER_LENGTH = 12`
  - Type exports: `QuestionOption`, `PlanQuestion`, `PlanQuestionInput`, `PlanQuestionOutput`
- **Key logic:** Uses `ctx.ui.custom<string[][] | null>()` with `{render, invalidate, handleInput}` pattern. Falls back to text in non-interactive mode.

### `prompts.ts` (136 lines) — System Prompts
- **Named exports:**
  - `CONCISENESS_DIRECTIVE: string` — caveman-micro conciseness (~85 tokens)
  - `PLAN_MODE_SYSTEM_PROMPT: string` — ~455 tokens (63% reduction from v1.0)
  - `PLAN_MODE_SYSTEM_PROMPT_BRIEF: string` — ~200 tokens for turns 2+
  - `EXECUTION_MODE_PROMPT: string` — ~50 tokens
  - `PLAN_TEMPLATE: string` — reference template (not embedded in system prompt)
- **No imports** (pure constants)

### `bash-safety.ts` (120 lines) — Dual-Gate Bash Safety
- **Named export:** `isSafeCommand(command: string): boolean`
- **DESTRUCTIVE_PATTERNS** — 32 regex patterns (rm, mv, git commit, npm install, sudo, editor launchers, pipe-to-interpreter, etc.)
- **SAFE_PATTERNS** — 48 regex patterns (cat, grep, ls, git status, npm list, curl, jq, etc.)
- **Dual-gate logic:** `!isDestructive && isSafe` — both must pass

### `plan-files.ts` (226 lines) — Plan File CRUD
- **Named exports:**
  - `PlanMetadata` interface — `{title, status, created, updated?, type}`
  - `PlanFile` interface — `{filename, metadata, content}`
  - `createPlanFile(cwd, filename, content, metadata): {path}`
  - `readPlanFile(cwd, filename): PlanFile | null`
  - `listPlans(cwd, status?): PlanFile[]`
  - `updatePlanStatus(cwd, filename, status): PlanFile | null`
  - `slugify(text): string` — generates `{date}-{slug}` filenames
- **Internal:** `parseFrontmatter` (own regex-based parser, NOT the `@earendil-works/pi-coding-agent` one)
- **No imports from sibling modules**

## 3. Test Infrastructure

### package.json scripts
```json
"typecheck": "tsc --noEmit",
"lint": "biome check .",
"lint:fix": "biome check --write .",
"format": "biome format --write .",
"test": "echo \"No tests yet\" && exit 0"
```

- **No test framework configured.** No vitest, jest, mocha, etc.
- **No test files exist.** The `extensions/plan-mode/` directory has zero `*.test.ts` or `*.spec.ts` files.
- CI runs only `npm run typecheck` + `npm run lint`
- Existing plan `.pi/plans/2026-05-31-comprehensive-test-suite.md` and `.pi/plans/2026-05-31-vitest-test-suite.md` suggest test plans were written but not implemented.

## 4. Dependencies

### Peer Dependencies (required by pi host — not bundled)
| Package | Version |
|---|---|
| `@earendil-works/pi-agent-core` | `*` |
| `@earendil-works/pi-ai` | `*` |
| `@earendil-works/pi-coding-agent` | `*` |
| `@earendil-works/pi-tui` | `*` |
| `typebox` | `*` |

### Dev Dependencies (typechecking only, never bundled)
| Package | Version |
|---|---|
| `@biomejs/biome` | `^2.4.0` |
| `@earendil-works/pi-agent-core` | `^0.74.0` |
| `@earendil-works/pi-ai` | `^0.74.0` |
| `@earendil-works/pi-coding-agent` | `^0.74.0` |
| `@earendil-works/pi-tui` | `^0.74.0` |
| `typebox` | `^1.1.0` |
| `typescript` | `^5.0.0` |

**No runtime dependencies at all.** The extension has zero bundled deps; `"files"` in package.json ships only `extensions/`, `CHANGELOG.md`, `README.md`, `LICENSE`.

### External API imports (consumed from pi host)
| Import | Used In |
|---|---|
| `ExtensionAPI` from `@earendil-works/pi-coding-agent` | index.ts, commands.ts, events.ts, tools.ts, question-prompt.ts |
| `ExtensionContext` from `@earendil-works/pi-coding-agent` | state.ts, commands.ts |
| `getMarkdownTheme`, `parseFrontmatter` from `@earendil-works/pi-coding-agent` | index.ts, tools.ts |
| `AgentMessage` from `@earendil-works/pi-agent-core` | state.ts, events.ts |
| `AssistantMessage`, `TextContent` from `@earendil-works/pi-ai` | state.ts, events.ts |
| `Key`, `matchesKey`, `Markdown`, `truncateToWidth`, `visibleWidth`, `wrapTextWithAnsi` from `@earendil-works/pi-tui` | index.ts, question-prompt.ts |
| `Type` from `typebox` | tools.ts, question-prompt.ts |
| `node:fs`, `node:path` | plan-files.ts |

## 5. Key Exports from `index.ts`

```typescript
export default function planModeExtension(pi: ExtensionAPI): void;
```

This is the **only export**. It's the entry point pi calls when loading the extension. It:
1. Creates `PlanModeState` via `createInitialState()`
2. Registers a custom message renderer for `"plan-content"` type
3. Registers `--plan` CLI flag
4. Defines UI helpers (`updateUI`, `persistState`, `enterPlanMode`, `exitPlanMode`, `togglePlanMode`)
5. Creates `PlanModeCallbacks` object
6. Registers shortcut `Ctrl+Alt+P`
7. Calls `registerCommands(pi, state, callbacks)`
8. Calls `registerTools(pi)`
9. Calls `registerPlanQuestionTool(pi)`
10. Calls `registerEvents(pi, state, callbacks)`

## 6. State Machine & Module Dependency Graph

### State Machine
```
  Normal Mode ←─── /plan (toggle) ───→ Plan Mode (read-only)
       ↑                                      │
       │                              /execute_plan [name]
       │                                      │
       │                                      ↓
       └──────── /plan (toggle) ─── Execution Mode (edit/write)
       (or auto on completion)         │
                                       │ [DONE:n] tracking
                                       │ ⏸️ PAUSE detection
                                       │ all items complete → auto-exit
                                       └──────────────────────────┘
```

**State transitions:**
- **Normal → Plan:** Tools restricted to `PLAN_MODE_TOOLS` (no `edit`/`write`), bash dual-gate active
- **Plan → Normal:** Tools restored to `NORMAL_MODE_TOOLS`, state cleared
- **Plan → Execution:** Plan mode disabled, execution mode enabled, full tools restored, plan content loaded, todoItems extracted
- **Execution → Normal:** Auto on all-todos-complete, or manual via `/plan` toggle

**State persistence:** `pi.appendEntry("plan-mode-v2", {...})` on every state change. Restored on `session_start` from `ctx.sessionManager.getEntries()`.

### Module Dependency Graph (non-circular)

```
                 index.ts (orchestrator)
                 /    |     \        \
                /     |      \        \
       commands.ts  events.ts  tools.ts  question-prompt.ts
          |         |    \       |           |
          |         |     \      |           |
       plan-files.ts |  prompts.ts  plan-files.ts  (external: TypeBox, pi-tui)
          |          |                   |
          +-- state.ts ←-- bash-safety.ts
          (leaf)          (leaf)

Legend:  → = imports from
         state.ts imports nothing from siblings (true leaf)
         bash-safety.ts imports nothing from siblings (true leaf)
         prompts.ts imports nothing from siblings (true leaf)
         plan-files.ts imports nothing from siblings (leaf, but uses node:fs/path)
```

**Dependency details:**
| Module | Imports From |
|---|---|
| `index.ts` | commands.ts, events.ts, question-prompt.ts, state.ts, tools.ts |
| `commands.ts` | plan-files.ts, state.ts |
| `events.ts` | bash-safety.ts, prompts.ts, state.ts |
| `tools.ts` | plan-files.ts, typebox, @earendil-works/pi-coding-agent |
| `question-prompt.ts` | typebox, @earendil-works/pi-tui, @earendil-works/pi-coding-agent |
| `state.ts` | (none) — only pi core types |
| `prompts.ts` | (none) — pure constants |
| `bash-safety.ts` | (none) — pure function |
| `plan-files.ts` | (none) — only node:fs/path |

**No circular dependencies.** State flows one direction: `plan-files.ts` and `state.ts` are leaves; `commands.ts`, `events.ts`, `tools.ts` consume them; `index.ts` orchestrates everything.

### Key Configuration Patterns

- **No build step.** `tsconfig.json` uses `allowImportingTsExtensions: true`, `moduleResolution: "bundler"`, `noEmit: true`. TS files are the runtime source.
- **Biome** for lint/format, not ESLint/Prettier.
- **TypeBox** for tool parameter schemas (peer dependency from pi host).
- **Two different `parseFrontmatter` functions:** `plan-files.ts` has its own simple regex-based parser; `tools.ts` imports `parseFrontmatter` from `@earendil-works/pi-coding-agent` for stripping existing frontmatter when rendering plan content inline.
- **Plan files** live in `.pi/plans/` (gitignored). One `.md` file per plan with YAML frontmatter.

## 7. Start Here

**First file to open:** `extensions/plan-mode/index.ts` — the orchestrator. It imports everything, creates state, and wires together all modules. From there, follow imports to understand each module's role.

For the state machine, go: `index.ts` → `state.ts` (types, tool sets) → `events.ts` (state transitions, hooks) → `commands.ts` (user commands that trigger transitions).
