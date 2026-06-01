# Changelog

## [1.5.0](https://github.com/wilfredinni/pi-openplan/compare/v1.4.0...v1.5.0) (2026-06-01)

### Added

 - Vitest test suite with 12 test files and 204+ tests covering every module
 - vitest.config.ts — v8 coverage, includes extensions/plan-mode/, excludes index.ts
 - tests/helpers.ts — shared mock factories (createMockPi, createMockCtx, createTestState, createCallbacks) with unique per-test CWDs
 - Integration tests:
     - tests/index.test.ts — bootstrap: registers 4 tools, 3 commands, 6 events, renderer, flag, shortcut
     - tests/state.test.ts — 25 tests for state creation, message helpers, todo extraction, DONE marker parsing
     - tests/tools.test.ts — plan_write, plan_read, plan_list execution
     - tests/commands.test.ts — /plan, /plans, /execute_plan handlers and rollback
     - tests/plan-files-fs.test.ts — memfs-backed CRUD for plan files
 - Unit tests:
     - tests/plan-files-pure.test.ts — slugify edge cases
     - tests/prompts.test.ts — all 5 prompt constants content/format validation
     - tests/question-prompt.test.ts — 15 tests for TUI overlay (select, multi-select, tabs, custom input, render caching)
     - tests/bash-safety.test.ts — destructive/safe command classification
     - tests/events.test.ts — all 6 event hooks
 - tsconfig.json — widened include to cover tests/**/*.ts
 - Model name in package-lock.json to pi-openplan

 ### Changed

 - Bash safety curl rules strengthened:
     - -o/--output, -O/--remote-name, -d/--data, -F/--form, -T/--upload-file — all blocked on any path
     - -X/--request with POST/PUT/DELETE/PATCH — blocked
     - Safe pattern rewritten: only bare curl (no destructive flags) is permitted
 - All 3 tools (plan_write, plan_read, plan_list) — now throw errors instead of returning { isError: true } (pi runtime only sets the error flag on thrown errors)
 - plan_write — strips existing frontmatter from content before saving (uses SDK parser to avoid nested frontmatter)
 - plan_read — added --- separator between metadata and content in full output
 - Context filtering — when plan mode is active, only the most recent plan-mode-context message is kept; older duplicates are pruned
 - state.ts — isAssistantMessage widened input to MessageLike interface to avoid cross-package type narrowing issues
 - plan-files.ts — switched from custom regex frontmatter parser to SDK's parseFrontmatter
 - events.ts — { triggerTurn: false } → { deliverAs: "nextTurn" } in 3 places (future-proofing for pi SDK API)
 - session_start — planModeTurnCount reset to 0 on resume so full prompt is injected on first turn
 - index.ts: updateUI — early-return when !ctx.hasUI to prevent theme access errors in non-interactive modes
 - AGENTS.md — updated with Node 22+ requirement, new npm scripts, CI test step, testing gotchas
 - context.md — fully rewritten with detailed module descriptions, dependency graphs, and state machine docs
 - package-lock.json — regenerated (6,223 insertions, 2,255 deletions)
 - package.json — version bumped, new dev deps (vitest, memfs, package names)

### Fixed

 - /execute_plan rollback — when plan name is not found or read fails, state now properly restores planModeEnabled, clears executionMode, resets tool set to
   PLAN_MODE_TOOLS, and calls updateUI; error notification shown instead of warning

## [1.4.0](https://github.com/wilfredinni/pi-openplan/compare/v1.3.0...v1.4.0) (2026-05-31)


### Features

* update docs ([ac49f58](https://github.com/wilfredinni/pi-openplan/commit/ac49f58bafcbe1e7713497c1dfd43d9dbc4a6767))

## [1.3.0](https://github.com/wilfredinni/pi-openplan/compare/v1.2.0...v1.3.0) (2026-05-29)


### Features

* release ([c4d0062](https://github.com/wilfredinni/pi-openplan/commit/c4d00620e2ad91d0b21ce0f544811a6ace782393))
* release ([09d9e8a](https://github.com/wilfredinni/pi-openplan/commit/09d9e8a8fd54321132722fd56a5118c28010f47d))

## [1.2.0](https://github.com/wilfredinni/pi-openplan/compare/v1.1.0...v1.2.0) (2026-05-29)


### Features

* fix typing ([dbb87e3](https://github.com/wilfredinni/pi-openplan/commit/dbb87e3ca971d57822301f301db2a18d6c75f7ed))
* optimize tokens ([723ed50](https://github.com/wilfredinni/pi-openplan/commit/723ed5067c6f8d2ade4a739b7756ddc401098f78))

## [1.1.0](https://github.com/wilfredinni/pi-openplan/compare/v1.0.0...v1.1.0) (2026-05-29)


### Features

* Add visibleWidth and wrapTextWithAnsi imports for text layout ([04003a0](https://github.com/wilfredinni/pi-openplan/commit/04003a07d805b5cedbcf9abe1a32a2f20f37a2b9))

## 1.0.0 (2026-05-28)


### Features

* first release ([944853b](https://github.com/wilfredinni/pi-openplan/commit/944853bf2f5684c6efe63507c4dbf9558891cdd3))
* update license ([2bcebf2](https://github.com/wilfredinni/pi-openplan/commit/2bcebf2f3e2b634753da11a033c9835f109ea604))
* update lincese ([df2411b](https://github.com/wilfredinni/pi-openplan/commit/df2411b1ae8157cb0972465b0194a7f894256e85))
