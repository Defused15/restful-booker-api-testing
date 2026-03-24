# Restful Booker API Testing

## [View Latest Test Report](https://defused.github.io/restful-booker-api-testing/)

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

> **Note:** `restful-booker.postman_environment.json` is intentionally committed to this repository.
> It contains only **public test credentials** provided by the Restful Booker demo API — there is no real or sensitive data here.

| Variable | Description | Default |
|----------|-------------|---------|
| `base_url` | API base URL | `https://restful-booker.herokuapp.com` |
| `username` | Auth username (demo) | `admin` |
| `password` | Auth password (demo) | `password123` |
| `token` | Auth token (set automatically by Setup) | _(empty)_ |

Collection variables (`booking_id`, `firstname`, `lastname`, etc.) are set automatically by the Setup requests and shared across tests within the same run.

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
