# Code Context — pi-openplan

## Overview

**pi-openplan** is a pi extension (v1.2.0) that adds a read-only plan mode to pi. TypeScript ESM with **10 source files** in `extensions/plan-mode/`. Provides plan mode toggle, structured plan files (`.pi/plans/`), interactive TUI question system, phased execution tracking, bash safety filtering, and token metrics.

## Project Structure

```
pi-openplan/
├── extensions/plan-mode/
│   ├── index.ts            — Extension entry point, wires all modules
│   ├── state.ts            — Shared state, types, tool sets, todo extraction
│   ├── commands.ts         — Command handlers: /plan, /plans, /execute_plan
│   ├── events.ts           — Event handlers: bash safety, prompts, DONE tracking, session restore
│   ├── tools.ts            — Tool registrations: plan_write, plan_read, plan_list
│   ├── question-prompt.ts  — Interactive plan_question TUI overlay
│   ├── prompts.ts          — System prompts, conciseness directive, plan template
│   ├── token-metrics.ts    — Token estimation, collection, lifetime aggregation
│   ├── bash-safety.ts      — Dual-gate command safety (destructive + safe patterns)
│   └── plan-files.ts       — CRUD for .pi/plans/, frontmatter parsing
├── .pi/plans/              — Saved plan files (gitignored)
├── .github/workflows/      — CI (type-check + lint) and Release (release-please)
├── package.json            — ESM, peer deps on pi packages + typebox
├── tsconfig.json           — ES2022, bundler resolution, strict mode
└── context.md              — This file
```

## Key Architecture

- **State machine**: Normal Mode → Plan Mode (read-only) → Execution Mode → Normal Mode
- **State persisted via** `pi.appendEntry("plan-mode-v2", ...)`, survives restarts
- **Tool restriction**: 32 destructive patterns blocked, ~47 safe patterns allowed, must pass both gates
- **3 commands**: `/plan`, `/plans`, `/execute_plan [name]`
- **4 LLM tools**: `plan_write`, `plan_read`, `plan_list`, `plan_question`
- **6 event hooks**: `tool_call`, `before_agent_start`, `turn_end`, `agent_end`, `session_start`, `context`
- **Token optimization**: ~455 token system prompt (63% reduction), caveman conciseness directive
