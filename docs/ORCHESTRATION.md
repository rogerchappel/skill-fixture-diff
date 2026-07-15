# Orchestration

## Recommended Agent Flow

1. Run the target skill against fixture inputs and write actual outputs.
2. Run `skill-fixture-diff --fixtures <dir> --format markdown`.
3. If severity is `fail`, fix the skill or update expected fixtures with reviewer context.
4. Paste the markdown report into the release-candidate PR.

## CI Flow

```bash
npm test
npm run check
npm run smoke
```

## Side Effects

The tool reads fixture files and writes reports only to standard output. It does not mutate files, call remote services, push commits, or publish packages.
