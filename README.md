# Restful Booker API Testing

[![API Tests](https://github.com/defused15/restful-booker-api-testing/actions/workflows/api-tests.yml/badge.svg)](https://github.com/defused15/restful-booker-api-testing/actions/workflows/api-tests.yml)
[![QA Test Hub](https://img.shields.io/badge/QA%20Test%20Hub-Dashboard-blue)](https://qa.rcastillo.dev/projects/Restful-Booker.html)
[![Request Report](https://img.shields.io/badge/Request%20Report-Assertions%2C%20Requests%20%26%20Responses-lightgrey)](https://defused15.github.io/restful-booker-api-testing/)
[![Raw Report](https://img.shields.io/badge/Raw%20Report-htmlextra-lightgrey)](https://defused15.github.io/restful-booker-api-testing/htmlextra.html)

## [View Test Dashboard on the QA Test Hub](https://qa.rcastillo.dev/projects/Restful-Booker.html)

The QA Test Hub shows run history, pass-rate and duration trends, slowest requests, and each request's assertions. For each request's assertions, headers and bodies in the latest run, see the [request report](https://defused15.github.io/restful-booker-api-testing/) (credentials and tokens masked). The previous [htmlextra report](https://defused15.github.io/restful-booker-api-testing/htmlextra.html) is still published.

Postman collection for testing the [Restful Booker](https://restful-booker.herokuapp.com) API, covering happy path, negative cases, edge cases, security, and performance scenarios. Automated via Newman and GitHub Actions.

---

## Test Coverage

| Module | Folder | Tests |
|--------|--------|-------|
| Auth | 00 - Setup | Health check (`GET /ping`), token generation |
| Auth | 01 - Happy Path | Valid login, token format, Content-Type, response time |
| Auth | 02 - Negative Cases | Wrong password, wrong username, empty body |
| Auth | 03 - Security | SQL injection, XSS attempt |
| Auth | 04 - Performance | Response time < 500ms |
| Booking | 00 - Setup | Create booking (schema validation), store variables |
| Booking | 01 - Happy Path | Get all, get by id (schema validation), filter by name, filter by name with no match (empty array), filter by dates (accepts params; filtering accuracy not validated — known API limitation), full update with token cookie (schema validation), full update with Basic auth, partial update, get by id as XML, delete, verify deletion |
| Booking | 02 - Negative Cases | Invalid id, missing required fields, update/partial update/delete without auth, update with an invalid token |
| Booking | 03 - Edge Cases | totalprice = 0, special characters in name, wrong type for totalprice (stored as null), update non-existent booking, cleanup of every edge-case booking |

---

## Requirements

- [Node.js](https://nodejs.org) v20+ (CI uses Node 24)
- [Postman](https://www.postman.com/downloads/) (for running in the UI)

---

## Running in Postman

1. Clone this repository
2. Open Postman → **Import** → select `Restful-Booker.postman_collection.json`
3. Import the environment: **Import** → select `restful-booker.postman_environment.json`
4. Select the **Restful-Booker** environment from the environment dropdown
5. Run the full collection with the **Collection Runner** (maintain folder order so Setup runs first — if folders run out of order, `token` and `booking_id` won't be initialized and all downstream tests will fail)

---

## Running with Newman (CLI)

Install dependencies:

```bash
npm ci
```

Run with HTML report (local):

```bash
npm test
```

The HTML report will be generated at `reports/report.html`.

Run with JUnit report (CI):

```bash
npm run test:ci
```

---

## CI/CD - GitHub Actions

The workflow at [.github/workflows/api-tests.yml](.github/workflows/api-tests.yml) runs automatically on:

- Every push to `main`
- Every pull request targeting `main`
- Weekly on Mondays at 08:00 UTC (scheduled)
- Manual trigger via `workflow_dispatch`

On scheduled runs, a `keepalive` job re-enables the workflow through the GitHub API. This resets GitHub's 60-day inactivity timer, so the schedule doesn't get disabled when the repository goes quiet.

After each run, the JUnit XML report is uploaded as an artifact and displayed inline in the GitHub Actions summary.

Runs on `main` (push, schedule or manual) publish the Newman JSON report to the [QA Test Hub](https://qa.rcastillo.dev/projects/Restful-Booker.html) and deploy the request report to GitHub Pages. Only the built page (`reports/site/`) is deployed, never the raw Newman JSON. Pull request runs only test and report in the PR, so they never overwrite the published report.

Third-party actions are pinned to full commit SHAs, with the release tag in a comment.

---

## Environment Variables

Copy `restful-booker.postman_environment.example.json`, rename it to `restful-booker.postman_environment.json`, and fill in your values. The actual environment file is gitignored to keep credentials out of source control.

| Variable | Description | Default |
|----------|-------------|---------|
| `base_url` | API base URL | `https://restful-booker.herokuapp.com` |
| `username` | Auth username | _(set in your environment file)_ |
| `password` | Auth password | _(set in your environment file)_ |
| `token` | Auth token (set automatically by Setup) | _(empty)_ |

> **Note on test report visibility:** The HTML report displays resolved request bodies, including the `username` and `password` sent to `/auth`. This is intentional — Restful Booker is a public demo API with shared credentials, so no real sensitive data is exposed. If you adapt this suite for a private API, consider adding `--reporter-htmlextra-omitRequestBodies` to the Newman scripts to hide request payloads from the report.

---

## Test Data

All test data is hardcoded in the collection. No manual configuration is needed beyond the environment variables above.

| Request | Test data used |
|---------|----------------|
| Booking Setup | Brandon Sanderson, price: 30, checkin: 2026-06-01, checkout: 2026-06-10 |
| Full Update (token cookie) | Steve King, price: 33, checkin: 2026-07-01, checkout: 2026-07-15 |
| Full Update (Basic auth) | Basic Auth, price: 321, checkin: 2026-09-01, checkout: 2026-09-05 |
| Edge - totalprice zero | Edge Case, price: 0, checkin: 2026-08-01, checkout: 2026-08-10 |
| Edge - special characters | José García-López, price: 100, checkin: 2026-08-01, checkout: 2027-08-01 |
| Edge - totalprice as string | Edge Case, price: "not-a-number", checkin: 2026-08-01, checkout: 2026-08-10 |
| Edge - update non-existent booking | Ghost User, price: 99, checkin: 2025-01-01, checkout: 2025-01-10 |

Collection variables (`booking_id`, `firstname`, `checkin`, etc.) are set automatically by the Setup scripts and shared across tests within the same run.

---

## Request Report

`scripts/report/build-report.mjs` turns `reports/newman-report.json` into a static page (`index.html` plus `assets/`) with a summary, failing requests, a searchable table and a drawer with each request's assertions, request and response. Authorization, cookie and token headers, and password, token and key fields in bodies and URLs, are replaced with `••••`.

```bash
npm run test:ci                                              # produces reports/newman-report.json
npm run report:build -- reports/newman-report.json reports/site
```

The page is covered by build tests (escaping and redaction) and Playwright tests (keyboard, touch, paging and filtering stability, URL state, contrast in both themes, hostile input). Screenshots are written to `test-results/screenshots/`.

```bash
npx playwright install chromium   # once
npm run test:report
```

---

## Collection Source of Truth

`Restful-Booker.postman_collection.json` (v2.1) is the source of truth: Newman runs it locally and in CI. The `postman/` folder is a Postman v3 (YAML) copy for the Postman app's local and git-connected workflow. After changing the JSON collection, regenerate the copy with the [Postman CLI](https://learning.postman.com/docs/postman-cli/postman-cli-installation/):

```bash
npm run postman:sync
```

Don't edit files under `postman/` by hand; changes there are overwritten on the next sync.

---

## Project Structure

```
restful-booker-api-testing/
├── .github/
│   └── workflows/
│       └── api-tests.yml                    # GitHub Actions CI workflow
├── reports/                                 # Generated test reports (gitignored)
├── scripts/report/                         # Request report builder and page assets
├── tests/                                   # Report page tests (node:test and Playwright)
├── postman/                                 # Postman v3 (YAML) copy, generated from the JSON collection
├── Restful-Booker.postman_collection.json   # Main collection (source of truth)
├── restful-booker.postman_environment.json  # Environment variables (gitignored)
├── package.json                             # Newman scripts and dependencies
└── README.md
```
