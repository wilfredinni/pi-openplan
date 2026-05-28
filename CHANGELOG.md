# Changelog

## [1.0.0] - 2026-05-28

### Added

- Initial release of pi-openplan
- `/plan` command to toggle read-only plan mode
- `/plans` command to list saved plans
- `Ctrl+Alt+P` keyboard shortcut to toggle plan mode
- `--plan` CLI flag to start in plan mode
- `plan_write`, `plan_read`, `plan_list` tools for plan file management
- Plan file storage in `.pi/plans/` with YAML frontmatter metadata
- Progress tracking with `[DONE:n]` markers and UI widget
- Bash safety enforcement in plan mode (destructive commands blocked)
- Execution mode with pause point detection
- State persistence across session restarts
