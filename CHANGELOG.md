# Changelog

## 1.0.0 (2026-05-28)


### Features

* first release ([944853b](https://github.com/wilfredinni/pi-openplan/commit/944853bf2f5684c6efe63507c4dbf9558891cdd3))
* update license ([2bcebf2](https://github.com/wilfredinni/pi-openplan/commit/2bcebf2f3e2b634753da11a033c9835f109ea604))
* update lincese ([df2411b](https://github.com/wilfredinni/pi-openplan/commit/df2411b1ae8157cb0972465b0194a7f894256e85))

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
