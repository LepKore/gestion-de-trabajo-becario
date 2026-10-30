# Implementation Plan: UPB Becario Work and Hours Management Platform

**Branch**: `001-becas-upb-management` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-becas-upb-management/spec.md`

## Summary

The feature adds an evaluation module for scholarship jobs, allowing `ENCARGADO` users to rate attended becarios on 4 criteria after job closure. The visible rating uses evaluations available among the last 10 trabajos realizados (closed jobs with confirmed attendance); fewer than 10 yields `faltan realizar trabajos`. Evaluation is separate from attendance and never changes credited minutes.

## Technical Context

**Language/Version**: JavaScript ESM on Node.js `>=22` (Node.js 24.19.0 verified locally)

**Primary Dependencies**: Express 5.3, PostgreSQL via `pg` 8.16, zod 4.6, argon2 0.45, cookie-parser 1.4, helmet 8.3

**Storage**: PostgreSQL

**Testing**: Node's built-in `node:test` runner via `npm test`; Vitest is not installed and is not part of this feature.

**Target Platform**: Linux server

**Project Type**: web-service

**Performance Goals**: 100% traceability of credited hours to attendance closure; validate response-time targets with integration tests.

**Constraints**: SQL-based rating calculation, canonical contract in `openapi.yaml`, immutable evaluations, no post-close hour mutation, and no new runtime dependency unless explicitly approved. Saved evaluations are read only through owner-authorized closed-job attendance and owner history; there is no database migration or change to student/admin response shapes.

**Quality Gates**: `npm run check`, `npm test`, `npm run build`, `npm run lint`, contract validation, and the repository audit. `npm run lint` is configured with ESLint and must pass before implementation completion.

**Scale/Scope**: Institutional deployment for UPB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] Canonical API & Integration — `openapi.yaml` remains the source of truth.
- [x] Synchronized Cross-Repository Progression — backend contract is now published for later web consumption; web remains blocked only until it updates against this revision.
- [ ] Test-First & Quality Gates — commands are configured; implementation and test execution remain pending.
- [ ] Integration Testing & Contract Verification — evaluation tests and contract updates are planned but not implemented.
- [x] Simplicity, YAGNI & Incremental Delivery — no Vitest or unnecessary runtime dependency is introduced.

**Gate status**: Implementation MUST NOT begin until the frontend repository confirms consumption of the relevant `openapi.yaml` revision. Final completion also requires contract tests and integration tests to pass.

## Project Structure

### Documentation (this feature)

```text
specs/001-becas-upb-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── lib/
├── middleware/
├── routes/
├── services/
├── app.js
└── server.js
migrations/
test/
openapi.yaml
```

**Structure Decision**: Backend structure follows the existing repository root; this
repository is already the backend and does not contain a nested `backend/` directory.

## Verification and Coordination

- Run `npm run check`, `npm test`, `npm run build`, `npm run lint`, contract validation, and the repository audit locally before completion.
- Keep evaluation tests on `node:test`; do not add Vitest for this feature.
- Coordinate the evaluation contract with `gestion-de-trabajo-becario-web` using the canonical `openapi.yaml` before marking cross-repository integration complete.
- Record the reviewed contract revision from `openapi.yaml` in the implementation evidence.
- **T004 checkpoint evidence (2026-10-29):** the web repository explicitly confirmed that its evaluation work is blocked until the backend publishes evaluation endpoints, schemas, average responses, and permissions. This backend slice publishes those definitions in `openapi.yaml`; frontend consumption remains a subsequent task. Reviewer: backend coordinator. Unresolved: frontend must update its endpoint client and confirm consumption of this revision.
- **Direct web review corrected (2026-10-30):** inspected `gestion-de-trabajo-becario-web` at commit `7716e97` on `dev` after updating the checkout. `src/lib/api.js` supports `/api/v1`, JSON, cookie credentials and `X-CSRF-Token`; `src/api/endpoints.js` is the single source of frontend routes and still cites backend OpenAPI 1.4.0 (`8ed9226`). It has no routes for `/me/rating`, `/applications/{id}/evaluation` or `/students/compliance`, so frontend integration with backend OpenAPI 1.5.0 (`2aaadb9`) remains pending. This corrects the earlier review of stale checkout `7628a29`; backend evaluation, rating and compliance integration tests passed without depending on frontend source files.
- Treat the administrative compliance report as one backend response containing becario identity, required minutes, credited minutes, remaining minutes, and completion status; pagination or multiple requests do not satisfy SC-004 without an explicitly approved contract change.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | | |
