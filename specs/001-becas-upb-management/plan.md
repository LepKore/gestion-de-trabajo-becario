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

**Constraints**: Parameterized rating queries with deterministic last-10 selection; the service layer may calculate the final average while preserving the documented ordering and excluding missing evaluations. The canonical contract is `openapi.yaml`, evaluations are immutable, post-close hours cannot be mutated, and no new runtime dependency is introduced unless explicitly approved. Saved evaluations are read only through owner-authorized closed-job attendance and owner history; there is no database migration or change to student/admin response shapes.

**Quality Gates**: `npm run check`, `npm test`, `npm run build`, `npm run lint`, contract validation, and the repository audit. `npm run lint` is configured with ESLint and must pass before implementation completion.

**Scale/Scope**: Institutional deployment for UPB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] Canonical API & Integration — `openapi.yaml` remains the source of truth.
- [x] Synchronized Cross-Repository Progression — frontend consumes the backend contract at OpenAPI 1.6.0.
- [x] Test-First & Quality Gates — `npm run check`, `npm run build`, `npm run lint`, and the Node integration/unit suite have been executed successfully.
- [x] Integration Testing & Contract Verification — evaluation integration tests and contract checks cover the published endpoints and response schemas.
- [x] Simplicity, YAGNI & Incremental Delivery — no Vitest or unnecessary runtime dependency is introduced.

**Gate status**: Backend implementation, frontend consumption, and local validation are complete for this slice. Final completion is recorded against backend commit `130d2c9` and frontend commit `eb73b00`.

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
- **T004 checkpoint evidence (2026-10-30):** inspected `gestion-de-trabajo-becario-web` at commit `eb73b00`; `src/api/endpoints.js` consumes OpenAPI 1.6.0 routes for `/me/rating` and `/applications/{id}/evaluation`, and the UI/tests cover rating, evaluation persistence, owner-only visibility, and administrator privacy. Reviewer: backend coordinator. Unresolved: no contract issues remain for this slice.
- **Quality-gate evidence (2026-10-30):** `npm run check`, `npm run build`, `npm run lint`, the Node unit/integration suite, contract tests, repository audit, and the frontend 158-test/lint/build suite passed. The frontend integration was also exercised against a local disposable PostgreSQL database with Chromium.
- Treat the administrative compliance report as one backend response containing becario identity, required minutes, credited minutes, remaining minutes, and completion status; pagination or multiple requests do not satisfy SC-004 without an explicitly approved contract change.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | | |
