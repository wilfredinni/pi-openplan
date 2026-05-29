# Layout Bug Review — question-prompt.ts

## File Under Review

`/Users/carlosmontecinos/Projects/pi-openplan/extensions/plan-mode/question-prompt.ts` (529 lines)

The `PlanQuestionPrompt` class renders a bordered TUI overlay with tabs, options, custom text input, and a review pane. All bordered lines are produced by the `contentLine()` method, which truncates and pads.

---

## 1. Custom Text Input Line (`truncateToWidth` usage, ~line 509–517)

**Location**: `renderQuestionTab()`, lines ~509–517. The active-editing branch:

```typescript
if (this.editing && isSel) {
    const inputDisplay =
        this.inputBuffer || t.fg("dim", "Type your answer...");
    const inputPrefix = " ".repeat(NESTED_MARGIN);       // 4 spaces
    const inputContent = `${inputPrefix}${t.fg("accent", `> ${inputDisplay}${t.fg("accent", "▌")}`)}`;
    lines.push(this.contentLine(inputContent, width));
}
```

**Finding: The right border `│` does always align.** The chain is:

1. `contentLine` computes `contentWidth = width - 4`
2. Calls `truncateToWidth(inputContent, contentWidth)` — guarantees visible width ≤ contentWidth (pi-tui utils.js, `truncateToWidth` with `pad=false`)
3. Calls `visibleWidth(truncated)` — strips ANSI codes, returns true visible columns
4. Pads with `" ".repeat(contentWidth - visible)` to exactly fill the content area
5. Wraps in `│ ... │`

Both `truncateToWidth` and `visibleWidth` use the same grapheme segmenter and `graphemeWidth` function in pi-tui, so their width measurements are consistent.

**Minor cosmetic issue**: There is a nested `t.fg("accent", ...)` call inside another `t.fg("accent", ...)`. When `inputDisplay` is the placeholder `t.fg("dim", "Type your answer...")`, the ANSI nesting becomes:
```
\x1b[accent] > \x1b[dim]Type your answer...\x1b[0m\x1b[accent]▌\x1b[0m\x1b[0m
```
The redundant inner `\x1b[accent]` and outer `\x1b[0m` don't affect the visible width or alignment, but they produce unnecessary ANSI bytes. **Not a layout bug.**

---

## 2. `contentLine()` — Right-Border Alignment Guarantee

**Location**: lines 343–350

```typescript
private contentLine(content: string, width: number): string {
    const contentWidth = width - 4; // │ + space (2) + space + │ (2)
    const truncated = truncateToWidth(content, contentWidth);
    const visible = visibleWidth(truncated);
    const padding = " ".repeat(Math.max(0, contentWidth - visible));
    return `│ ${truncated}${padding} │`;
}
```

**Finding: Right border always aligns.** Proof by construction:

- Total width = `1 (│)` + `1 (space)` + `visibleWidth(truncated)` + `(contentWidth - visibleWidth(truncated))` + `1 (space)` + `1 (│)` = `contentWidth + 4` = `width`
- `truncateToWidth(content, contentWidth)` with default `pad=false` guarantees `visibleWidth(result) ≤ contentWidth`
- `visibleWidth` strips all ANSI escape sequences (CSI SGR, OSC hyperlinks, APC markers) before measuring — confirmed in `pi-tui/dist/utils.js` lines ~80–130
- The `graphemeWidth` function used by both `truncateToWidth` and `visibleWidth` handles emoji (width 2), East Asian wide chars (width 2), tabs (width 3), and zero-width characters (width 0)

**Edge case: ANSI codes in truncated content.** When `truncateToWidth` truncates, it calls `finalizeTruncatedResult` which appends `\x1b[0m...\x1b[0m` (SGR resets around the ellipsis). These reset codes have zero visible width. `visibleWidth` correctly strips them. **No miscalculation.**

**Edge case: `truncateToWidth` padding parameter.** The `contentLine` method calls `truncateToWidth(content, contentWidth)` with `pad` defaulting to `false`. Then it manually pads using `visibleWidth(truncated)`. This is redundant (calling `truncateToWidth` with `pad=true` would pad internally), but it's **correct** because both paths use the same width measurement logic.

---

## 3. `invalidate()` Caching

**Location**: `invalidate()` at line 336, `render()` at lines 341–343

```typescript
invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
}

render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
        return this.cachedLines;
    }
    // ... full render ...
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
}
```

**Finding: Cache is safe. Terminal width changes cannot cause stale lines.**

- When the terminal is resized, the next `render(width)` call receives the new `width`. Since `cachedWidth` (the previous width) ≠ `width`, the cache is bypassed and a full re-render occurs.
- All state mutations (tab changes, selection changes, editing, answer toggling) flow through `handleInput()` → branches that each call `this.invalidate()`. Verified at lines: 126, 131, 137, 143, 148, 160, 166, 181, 186, 201, 204, 210, 213, 234, 240, 260, 266, 275, 282.
- `commitCustomAnswer()` (line 288) does NOT call `invalidate()` itself, but it's always called from a `handleInput` branch that calls `invalidate()` immediately afterward (line 136).
- `selectCurrentOption()` calls `invalidate()` at lines 260, 266, 275.
- `tryAdvance()` does not call `invalidate()` itself, but every call site does afterward (lines 239, 276, 136).
- The component has no external state mutators — all state is private and only modified by keyboard input.

---

## 4. `truncateToWidth` Consistency Across All Lines

**Finding: Yes, `truncateToWidth` is consistently applied to every content-bearing line.** The only exceptions are spacer and border lines, which are constructed to exact width and do not need truncation.

| Line | Method | Uses `contentLine`? | Truncation applied? |
|---|---|---|---|
| Top border `╭─╮` | `render()` | No (raw) | N/A — exact width |
| Tab bar line | `render()` | Yes | Yes, via `contentLine` |
| Spacer lines | `spacerLine()` | No (raw) | N/A — `" ".repeat()` |
| Question text (wrapped) | `renderQuestionTab()` | Yes | Yes, via `contentLine` |
| Option labels | `renderQuestionTab()` | Yes | Yes, via `contentLine` |
| Option descriptions | `renderQuestionTab()` | Yes | Yes, via `contentLine` |
| Custom option label | `renderQuestionTab()` | Yes | Yes, via `contentLine` |
| Custom input area | `renderQuestionTab()` | Yes | Yes, via `contentLine` |
| Custom text (non-selected) | `renderQuestionTab()` | Yes | Yes, via `contentLine` |
| Help bar | `renderQuestionTab()` / `renderReviewTab()` | Yes | Yes, via `contentLine` |
| Review header | `renderReviewTab()` | Yes | Yes, via `contentLine` |
| Review items | `renderReviewTab()` | Yes | Yes, via `contentLine` |
| Bottom border `╰─╯` | `render()` | No (raw) | N/A — exact width |

The `spacerLine()` method:
```typescript
private spacerLine(width: number): string {
    return `│${" ".repeat(Math.max(0, width - 2))}│`;
}
```
Produces `│` + (width−2) spaces + `│` = total width `width`. No truncation needed.

---

## 5. `renderQuestionTab()` Description Indentation

**Location**: lines 441–444, 485–489

```typescript
const MARGIN = 2;
const NESTED_MARGIN = 4;
const NUM_WIDTH = this.isMultiSelect ? 3 : 2;  // [✓] vs "1."

const descIndent = " ".repeat(NESTED_MARGIN + NUM_WIDTH + 2);
```

**Finding: Correct for both modes.**

Label text column calculation:
- `optPrefix(isSel)`: `"  > "` (selected) or `"    "` (unselected) → always **4 chars**
- `optNumber(i, picked)`: `[✓]`/`[ ]` (multi: **3 chars**) or `1.`…`4.` (single: **2 chars**)
- Then `"  "` (2 spaces) before the label

Label text starts at column:
- Single-select: `4 + 2 + 2 = 8`
- Multi-select: `4 + 3 + 2 = 9`

`descIndent` computes:
- Single-select: `4 + 2 + 2 = 8` ✓
- Multi-select: `4 + 3 + 2 = 9` ✓

Descriptions appear below their option and are indented to align with the label text. The indent correctly accounts for prefix width (`NESTED_MARGIN` = 4), checkbox/number width (`NUM_WIDTH`), and the 2-space gap. **No misalignment.**

**Note**: Descriptions are rendered as a single line and truncated via `contentLine` if too long. They do not wrap to multiple lines. This is a UX limitation, not a layout bug — the right border still aligns.

---

## 6. `wrapTextWithAnsi` for Question Text

**Location**: lines 454–462

```typescript
const questionContent = `${t.fg("text", q.question)}${this.isMultiSelect ? t.fg("dim", " (select all that apply)") : ""}`;
const innerWidth = Math.max(1, width - 4 - MARGIN);
const wrappedLines = wrapTextWithAnsi(questionContent, innerWidth);
for (const line of wrappedLines) {
    lines.push(this.contentLine(" ".repeat(MARGIN) + line, width));
}
```

**Finding: Works correctly for long questions.**

- `innerWidth = width - 4 - 2 = width - 6` — accounts for border padding (4 chars: `│ ` + ` │`) and internal margin (2 chars).
- `wrapTextWithAnsi` returns lines where each is ≤ `innerWidth` visible chars.
- Each line is prepended with `MARGIN` (2 spaces), making it ≤ `innerWidth + 2 = width - 4 = contentWidth` visible chars.
- The concatenated `"  " + line` passes through `contentLine`, which truncates to `contentWidth`. Since the line already fits, truncation is a no-op.
- `wrapTextWithAnsi` correctly preserves ANSI codes across line breaks (via `AnsiCodeTracker` in pi-tui). Active styles (bold, dim, colors) carry over from one wrapped line to the next.

**Edge case**: The `questionContent` string has mixed ANSI styles — `t.fg("text", ...)` for the question body and `t.fg("dim", ...)` for the multi-select hint. `wrapTextWithAnsi` handles mixed styles correctly by tracking active SGR codes in a `AnsiCodeTracker`.

---

## 7. Misaligned Right `│` Border — Complete Line Audit

**Finding: No misaligned right border found.** Every line that could exceed the content area passes through `contentLine`, which guarantees:

1. Truncation to `contentWidth` visible characters (via `truncateToWidth`)
2. Measurement of visible width after truncation (via `visibleWidth`)
3. Space-padding to exactly fill `contentWidth`

### Line-by-line audit:

| Line type | Width calculation | Risk |
|---|---|---|
| Tab bar (`"  " + tabs`) | `contentLine` → truncate + pad | None |
| Spacer | `" ".repeat(width - 2)` in `│…│` | None (exact) |
| Wrapped question + margin | Wrapped ≤ `width-6`, +2 margin ≤ `width-4` → `contentLine` no-op | None |
| Option label | `prefix(4) + number(2-3) + "  " + label` → `contentLine` | None |
| Option description | `descIndent(8-9) + description` → `contentLine` | None |
| Custom label | Same as option label | None |
| Custom input | `indent(4) + "> " + input + "▌"` → `contentLine` | None |
| Custom text (shown) | `indent(4) + customText` → `contentLine` | None |
| Help bar | `"  " + help` → `contentLine` | None |
| Review header | `"  " + "Review your answers:"` → `contentLine` | None |
| Review items | `indent(4) + icon + " " + header + ": " + answers` → `contentLine` | None |
| Borders | `╭${"─".repeat(width-2)}╮` — exact width | None |

### Potential visual issues (not alignment bugs):

1. **ANSI reset in truncated text** (pi-tui `finalizeTruncatedResult`): When `truncateToWidth` truncates, it inserts `\x1b[0m` before and after the ellipsis. This means padding spaces after truncated text are unstyled. For a colored option that gets truncated, the padding would be default terminal color behind the `│` border. This is a *visual* inconsistency but does NOT affect alignment.

2. **`t.fg("dim", "")` in help bar** (line 528 in single-select path): `t.fg("dim", "")` produces just ANSI codes with no visible text. `visibleWidth` strips these, so the help bar width calculation is correct. The ANSI codes are harmless but wasteful.

3. **Descriptions don't wrap**: Long option descriptions are truncated with "…" rather than wrapped to multiple lines. This is consistent behavior (same as option labels) but could hide useful information.

---

## Summary of Findings

| Check | Result | Severity |
|---|---|---|
| 1. Custom input line truncation alignment | ✅ Correct — right border always aligns | None |
| 2. `contentLine()` ANSI edge cases | ✅ Handled — `visibleWidth` strips ANSI, `truncateToWidth` preserves them | None |
| 3. `invalidate()` cache with width changes | ✅ Safe — width mismatch triggers re-render; all mutations invalidate | None |
| 4. `truncateToWidth` on all lines | ✅ Consistent — every content line goes through `contentLine` | None |
| 5. Description indentation | ✅ Correct for both single-select and multi-select | None |
| 6. `wrapTextWithAnsi` for long questions | ✅ Correct — `innerWidth` accounts for border + margin | None |
| 7. Right `│` border misalignment | ✅ No misalignment found | None |

**No layout bugs found that would cause right-border misalignment.** The `contentLine` method's use of `truncateToWidth` + `visibleWidth` + manual padding is sound. The pi-tui utility functions correctly handle all ANSI codes, emoji, wide characters, and tabs in width calculations.

### Non-blocking cosmetic observations:
- Nested `t.fg("accent", ...)` in custom input line creates redundant ANSI escape codes
- `t.fg("dim", "")` produces zero-width ANSI codes in the help bar
- Option descriptions are truncated rather than wrapped when too long
- Truncated text may lose styling on padding spaces (ANSI reset from `truncateToWidth`'s ellipsis handling)
