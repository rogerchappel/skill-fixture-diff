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

- `--fixtures <dir>` reads all paired fixtures from a directory (single-use).
- `--format markdown|json` controls output format (single-use).
- `--fail-on warn|fail` chooses the minimum severity that exits non-zero
  (single-use).
- `--require-section <name>` can be repeated for markdown section checks.
- `--help`, `-h` prints usage information.

Exit codes:

- `0` means the comparison passed (or help was requested).
- `1` means fixture findings met the configured `--fail-on` threshold.
- `2` means the command could not run, including invalid CLI usage or fixture read errors.

Invalid options, duplicate single-use options, missing option values, and
unsupported `--format` or `--fail-on` values print a concise diagnostic and
usage text to standard error.

## What It Checks

- Empty directories or directories with no discoverable fixture files.
- Missing expected or actual fixture pairs.
- Markdown heading drift for required sections.
- Added, removed, or changed approval and side-effect boundary wording, matched
  as whole words or hyphen/space-separated terms rather than substrings of
  ordinary words. Repeated boundary lines are compared by occurrence count, so
  adding or removing one copy is still reported. These findings fail at the
  default threshold. Headings and
  boundary-like prose inside backtick or tilde fenced code blocks are treated
  as examples and excluded from these semantic checks, including fences with
  info strings.
- JSON type changes, missing keys, added keys, and value changes. Added ordinary
  keys warn, while a newly added boundary key or subtree containing one fails.
  Boundary keys are matched consistently whether terms use spaces or hyphens,
  and array length drift fails when the array path or its objects carry a
  boundary key.

## Limitations

- The comparator is intentionally conservative and deterministic.
- It does not call models, fetch remote data, or update fixture snapshots.
- Semantic equivalence is limited to structural checks and normalized text.
- Fenced-code recognition follows standard Markdown fence shape (at least three
  matching backticks or tildes, with up to three leading spaces); it is not a
  complete CommonMark parser. Changes inside fences can still produce the
  general normalized-text warning.

## Safety Notes

The tool is read-only. It never mutates source fixtures and has no network behavior.
