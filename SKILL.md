# Skill Fixture Diff

Use this skill when an agent has expected and actual skill-run fixtures and needs to decide whether observed drift is acceptable before release.

## Inputs

- A fixture directory containing `*.expected.md`, `*.actual.md`, `*.expected.json`, or `*.actual.json` pairs.
- Optional required markdown sections.

## Tools

- Local shell.
- Node.js 20 or newer.

## Side-Effect Boundaries

This skill is read-only. It may run local commands and read fixture files. It must not update snapshots, call external services, push changes, publish packages, or approve connector writes.

## Approval Requirements

Ask for explicit approval before using any future mode that rewrites fixtures. No approval is needed for the default read-only diff.

## Workflow

1. Confirm fixtures are local and safe to inspect.
2. Run `npm run smoke` or `skill-fixture-diff --fixtures <dir>`.
3. Review `fail` findings first, then `warn`.
4. Include the report in the PR or handoff.

Added, removed, and changed Markdown lines mentioning approval, external writes,
sends, publishing, or side effects are `fail` findings. Ordinary words that only
contain those tokens, such as `sender`, `writer`, and `rewrite`, are not treated
as boundaries.

## Example

```bash
node bin/skill-fixture-diff.js --fixtures fixtures/pass --format markdown --require-section "Safety Notes"
```

## Validation

Run:

```bash
npm test
npm run check
npm run smoke
```
