# Restful Booker API Testing

[![API Tests](https://github.com/defused15/restful-booker-api-testing/actions/workflows/api-tests.yml/badge.svg)](https://github.com/defused15/restful-booker-api-testing/actions/workflows/api-tests.yml)
[![Test Report](https://img.shields.io/badge/Test%20Report-View%20Latest-blue)](https://defused15.github.io/restful-booker-api-testing/)

## [View Latest Test Report](https://defused15.github.io/restful-booker-api-testing/)

Postman collection for testing the [Restful Booker](https://restful-booker.herokuapp.com) API, covering happy path, negative cases, edge cases, security, and performance scenarios. Automated via Newman and GitHub Actions.

---

## Test Coverage

| Module | Folder | Tests |
|--------|--------|-------|
| Auth | 00 - Setup | Token generation |
| Auth | 01 - Happy Path | Valid login, token format, Content-Type, response time |
| Auth | 02 - Negative Cases | Wrong password, wrong username, empty body |
| Auth | 03 - Security | SQL injection, XSS attempt |
| Auth | 04 - Performance | Response time < 500ms |
| Booking | 00 - Setup | Create booking, store variables |
| Booking | 01 - Happy Path | Get all, get by id (schema validation), filter by name, filter by dates, full update, partial update, delete, verify deletion |
| Booking | 02 - Negative Cases | Invalid id, missing required fields, update/delete without auth |
| Booking | 03 - Edge Cases | totalprice = 0, special characters in name, wrong type for totalprice, update non-existent booking |

---

## Requirements

- [Node.js](https://nodejs.org) v18+
- [Postman](https://www.postman.com/downloads/) (for running in the UI)

---

## Running in Postman

1. Clone this repository
2. Open Postman → **Import** → select `Restful-Booker.postman_collection.json`
3. Import the environment: **Import** → select `restful-booker.postman_environment.json`
4. Select the **Restful-Booker** environment from the environment dropdown
5. Run the full collection with the **Collection Runner** (maintain folder order so Setup runs first)

---

## Running with Newman (CLI)

Install dependencies:

```bash
npm install
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
- Daily at 08:00 UTC (scheduled)
- Manual trigger via `workflow_dispatch`

After each run, the JUnit XML report is uploaded as an artifact and displayed inline in the GitHub Actions summary.

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
| Full Update | Steve King, price: 33, checkin: 2026-07-01, checkout: 2026-07-15 |
| Edge - totalprice zero | Edge Case, price: 0, checkin: 2026-08-01, checkout: 2026-08-10 |
| Edge - special characters | José García-López, price: 100, checkin: 2026-08-01, checkout: 2027-08-01 |
| Edge - totalprice as string | Edge Case, price: "not-a-number", checkin: 2026-08-01, checkout: 2026-08-10 |
| Ghost booking | Ghost User, price: 99, checkin: 2025-01-01, checkout: 2025-01-10 |

Collection variables (`booking_id`, `firstname`, `checkin`, etc.) are set automatically by the Setup scripts and shared across tests within the same run.

---

## Project Structure

```
restful-booker-api-testing/
├── .github/
│   └── workflows/
│       └── api-tests.yml                    # GitHub Actions CI workflow
├── reports/                                 # Generated test reports (gitignored)
├── Restful-Booker.postman_collection.json   # Main collection
├── restful-booker.postman_environment.json  # Environment variables
├── package.json                             # Newman scripts and dependencies
└── README.md
```
