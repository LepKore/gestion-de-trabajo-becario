# Quickstart Validation Guide: Evaluation Module

## Prerequisites
- Backend local environment running (`npm run check` passes)
- Database migrated (`npm run db:migrate`)
- Baseline lint: `npm run lint` → passed on 2026-10-29.

## Runnable Scenarios

### 1. Evaluation Creation
1. Create a job (title: "Demo Job", status: `PUBLICADO`, with a declared duration).
2. Create an application for a `BECARIO` and accept it (`ACEPTADA`).
3. Close the job through the existing closure flow as its owning `ENCARGADO`, marking attendance exhaustively; verify attendance credits the duration.
4. Call `POST /applications/:id/evaluation` as the owning `ENCARGADO`.
5. Expect `201 Created` with four criteria and average; verify credited minutes are unchanged.

### 2. Rating Aggregation
1. Ensure the `BECARIO` has at least 10 trabajos realizados: closed jobs with confirmed attendance and available evaluations.
2. Call `GET /me/rating` as the `Becario`.
3. Verify the rating is the average of available evaluations among the last 10 trabajos realizados; with fewer than 10, verify `rating: null` and `message: "faltan realizar trabajos"`.

## Expected Outcomes
- API returns 201 for valid evaluation submissions.
- API returns 409 for duplicate evaluations on the same application.
- API blocks non-owners, open jobs, non-attended applications, and non-`ENCARGADO` roles.
- Rating aggregation uses the last 10 realized jobs, excludes unavailable evaluations, and never changes credited minutes.
- Administrator compliance responses contain hours/status only.
- Repeating an evaluation, editing/deleting one, or submitting a criterion outside 1–5 is rejected without changing existing data.
- Attendance remains the only source of credited minutes; an over-limit accreditation request fails atomically.
- Cancellation, evaluation edit/delete, and post-close hour correction are out of scope.

## Local performance measurement (2026-10-29)

Run `node --env-file-if-exists=.env scripts/measure-evaluations.js` with an explicit
`TEST_DATABASE_URL` pointing to a disposable local `mibeca*_test*` database. The script
recreates only that test schema, seeds 100 jobs and 1,000 applications, then makes 20
sequential authenticated requests per measured endpoint. Twenty attended applications
are evaluated through the real API. Seed rows use SQL; measured requests use HTTP.

| Endpoint | p95 |
|---|---:|
| `GET /jobs?pageSize=20` | 21.96 ms |
| `GET /me/progress` | 16.72 ms |
| `POST /applications/{id}/evaluation` | 39.18 ms |

Environment: local PostgreSQL 17.11 on `127.0.0.1:5433`, Node 24.19.0. These are local
sequential-request results, not a concurrent-load or production guarantee. They satisfy
the SC-001 2 s and SC-002 500 ms response-time thresholds for this dataset.

## Backend verification (2026-10-29)

`npm test`: 85/85 passed against the local disposable test database. `npm run lint`,
`npm run build`, `npm run audit:all` and `git diff --check` passed. Redocly validated
OpenAPI 1.5.0 with four warnings on pre-existing license, health responses and history
`oneOf`; none concern the evaluation or compliance paths.

The administrative compliance query lives in `src/services/student-progress.js` and is
registered by `src/routes/control.js`; it sums only `asistencias.minutos_acreditados`.
The web client at commit `7628a29` can transport the new calls but has no evaluation or
rating UI yet. Frontend integration is separate from this backend task block.

## Convergence verification (2026-10-29)

- Docker Desktop Engine 29.7.2 was active. The Docker CLI was not on PATH, but its engine API confirmed the postgres:17.11 container was healthy and published 127.0.0.1:5434.
- TEST_DATABASE_URL pointed to local 127.0.0.1:5434/mibeca_test, which did not exist initially. After verifying DATABASE_URL targeted local mibeca_dev on the same host and port, mibeca_test was created. The development database schema and rows were not changed; the test helper recreates only the public schema inside mibeca_test.
- npm test: 86/86 passed, including both quickstart scenarios, the new role/account-active matrix, response isolation, and minute traceability assertions.
- Scenario 1, evaluation creation: test/jobs-evaluation.test.js verifies owner eligibility, closed job, confirmed attendance, 201 response, immutable duplicate rejection, and unchanged credited minutes.
- Scenario 2, rating aggregation: test/jobs.test.js verifies ten realized jobs, available evaluations, and the fewer-than-ten response. Compliance isolation is covered by test/control-admin.test.js and test/control.test.js.
- T040 performance run: 100 jobs, 1,000 applications, and 20 authenticated requests per endpoint. Fresh p95: GET /jobs 15.12 ms; GET /me/progress 5.74 ms; evaluation creation 19.97 ms.
- npm run lint, npm run build, and npm run audit:all passed. Contract tests passed 2/2, syntax checks passed for 47 files, and the audit self-check passed 40/40.
