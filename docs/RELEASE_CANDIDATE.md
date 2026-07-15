# Release Candidate Notes

## Status

Classification: ship

## Verification

- `npm test` - pass, 4 tests.
- `npm run check` - pass, Node syntax checks.
- `npm run smoke` - pass, markdown report with 0 fail, 0 warn, 1 pass.

## Release Risks

- Markdown checks are structural and wording-based, not semantic.
- JSON comparisons intentionally flag added keys as warnings so fixture contracts can evolve.
