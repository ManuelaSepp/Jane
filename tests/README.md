`npm ci && npm test` runs the Apps Script API simulation and complete frontend DOM integration tests. No live Google Sheet or bank service is contacted.

The test harness covers immutable source rows, rates, partial/full payments, legacy paid flags, cross-year items, stale amounts, duplicate requests, validation, matching, confirmation, POST/ack handling, retry IDs, local templates and PDF payment details.

Real browser layout and an actual Apps Script/Sheets smoke test must be checked on a copy before release. A headless Edge launch was unavailable in the implementation environment.
