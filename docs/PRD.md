# Product Requirements: skill-fixture-diff

## Goal

Give agent-skill maintainers a deterministic fixture diff that highlights meaningful regressions without requiring external services.

## Non-Goals

- No snapshot rewriting.
- No model-based semantic judgment.
- No network access or repository mutation.

## User Stories

- As a skill author, I can compare expected and actual examples before publishing a skill change.
- As an automation agent, I can run a smoke gate and include the exact report in a PR.
- As a reviewer, I can see whether drift is a warning or a release blocker.

## Acceptance Criteria

- The CLI reads paired markdown and JSON fixtures from a directory.
- Reports include case names, file names, severity, check id, and message.
- JSON output is stable enough for CI parsing.
- Markdown output is compact enough to paste into a PR.
- Tests cover pass, warning, and failure cases.
