# skill-fixture-diff

`skill-fixture-diff` is a local-first CLI for comparing expected and actual agent-skill fixtures. It understands common skill artifacts such as markdown reports, JSON plans, required sections, approval text, and side-effect boundaries.

## Quickstart

```bash
npm test
npm run smoke
node bin/skill-fixture-diff.js --fixtures fixtures/pass --format markdown
```

Fixture directories contain paired files:

```text
case-name.expected.md
case-name.actual.md
case-name.expected.json
case-name.actual.json
```

## CLI

```bash
skill-fixture-diff --fixtures fixtures/pass --format markdown
skill-fixture-diff --fixtures fixtures/fail --format json --fail-on warn
```

Options:

- `--fixtures <dir>` reads all paired fixtures from a directory.
- `--format markdown|json` controls output format.
- `--fail-on warn|fail` chooses the minimum severity that exits non-zero.
- `--require-section <name>` can be repeated for markdown section checks.

## What It Checks

- Missing expected or actual fixture pairs.
- Markdown heading drift for required sections.
- Approval and side-effect boundary wording changes.
- JSON type changes, missing keys, added keys, and value changes.

## Limitations

- The comparator is intentionally conservative and deterministic.
- It does not call models, fetch remote data, or update fixture snapshots.
- Semantic equivalence is limited to structural checks and normalized text.

## Safety Notes

The tool is read-only. It never mutates source fixtures and has no network behavior.
