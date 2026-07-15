# Release Candidate Notes

## Status

Classification: ship

## Verification

- `npm test`
- `npm run check`
- `npm run smoke`

## Release Risks

- Markdown checks are structural and wording-based, not semantic.
- JSON comparisons intentionally flag added keys as warnings so fixture contracts can evolve.
