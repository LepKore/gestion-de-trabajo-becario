---

description: "Task list for the UPB scholarship work and evaluation feature"
---

# Tasks: UPB Becario Work and Hours Management Platform

**Input**: Design documents from `/specs/001-becas-upb-management/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api.md`, `quickstart.md`

**Tests**: Required by the constitution and the feature specification. Use the existing Node `node:test` runner.

**Organization**: Tasks are grouped by user story. Tests MUST be written and fail before the implementation tasks they cover.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel because it uses different files and has no dependency on incomplete work.
- **[Story]**: Required on user-story tasks only.
- Every task includes the repository-relative file path it changes or validates.

## Path Conventions

- Backend source: `src/`
- Tests: `test/`
- Database migrations: `migrations/`
- Canonical API contract: `openapi.yaml`
- Feature documents: `specs/001-becas-upb-management/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish quality gates, contract coordination, and regression coverage before feature implementation.

- [X] T001 [P] Record the existing Node `node:test` command and evaluation test entry points in `package.json` and `test/`
- [X] T002 [P] Run the repository lint baseline with `npm run lint` and record the result in `specs/001-becas-upb-management/quickstart.md`
- [X] T003 [P] Add regression tests for existing job listing, application, assignment, attendance, and hour accreditation in `test/jobs.test.js` and `test/control.test.js`, mapped to FR-001–FR-005
- [X] T004 Confirm with `gestion-de-trabajo-becario-web` that the evaluation contract in `openapi.yaml` is consumable; record revision, date, reviewer, and unresolved issues in `specs/001-becas-upb-management/plan.md`. This task blocks T005–T033.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the shared persistence, validation, routing, and error foundations required by all user stories.

- [X] T005 [P] Add the evaluation schema and the four integer fields with the constraint `1-5` in `src/lib/jobs-validation.js`
- [X] T006 [P] Add evaluation conflict and validation error helpers in `src/lib/errors.js`
- [X] T007 [P] Add the immutable evaluation table with one row per application, generated average, foreign keys, and `CHECK` constraints for values `1-5` in `migrations/0005_evaluaciones.sql`
- [X] T008 [P] Add evaluation request and response schemas, including `201/400/401/403/404/409` responses, to `openapi.yaml`
- [X] T009 [P] Add evaluation route registration points in `src/routes/jobs.js` without changing existing attendance or application response shapes

**Checkpoint**: T001–T004 establish the quality and contract baseline; T005–T009 establish the foundation. No user-story implementation starts before T004 and the quality commands pass.

---

## Phase 3: User Story 1 - Becario Rating and Hour Tracking (Priority: P1)

**Goal**: Becarios can view their own rating and continue to track hours independently of evaluations.

**Independent Test**: With closed jobs and confirmed attendance, `GET /me/rating` selects the 10 most recent realized jobs by closure timestamp descending and application UUID ascending, averages only existing evaluations, and returns `rating: null` with `message: "faltan realizar trabajos"` when fewer than 10 realized jobs exist.

### Tests for User Story 1

- [X] T010 [P] [US1] Add integration tests for `GET /me/rating` with 10 realized jobs, fewer than 10 realized jobs, missing evaluations, and unauthorized users in `test/jobs.test.js`
- [X] T011 [P] [US1] Add unit tests for deterministic last-10 selection, application UUID tie-breaking, exclusion of missing evaluations, and average calculation in `test/jobs-rating.test.js`
- [X] T012 [P] [US1] Add regression tests proving evaluation data never changes progress or credited minutes in `test/control.test.js`

### Implementation for User Story 1

- [X] T013 [US1] Implement the SQL rating aggregation in `src/services/jobs.js` using `CERRADO` jobs with confirmed attendance and the documented last-10 algorithm
- [X] T014 [US1] Implement `GET /me/rating` in `src/routes/jobs.js` with becario ownership authorization and the contract response from `openapi.yaml`
- [X] T015 [US1] Preserve the existing `GET /me/applications` response shape in `src/routes/jobs.js` and `src/services/jobs.js` unless the canonical contract adds an explicit additive field

**Checkpoint**: T010–T012 fail before implementation; after T013–T015, US1 rating and hour tracking tests pass independently.

---

## Phase 4: User Story 2 - Encargado Evaluation (Priority: P2)

**Goal**: An `ENCARGADO` can create one immutable evaluation for an attended becario on the encargado's own closed job.

**Independent Test**: `POST /applications/:id/evaluation` succeeds only for an `ENCARGADO` who owns the closed job and whose assigned application has confirmed attendance; it stores four values from `1-5`, calculates the average, and changes no credited minutes.

### Tests for User Story 2

- [X] T016 [P] [US2] Add authorization matrix tests for evaluation, rating, attendance, and compliance operations in `test/authorization.test.js`
- [X] T017 [P] [US2] Add integration tests for owner-only, `CERRADO`-only, confirmed-attendance-only, duplicate, range, immutable, and no-hour-change rules in `test/jobs-evaluation.test.js`
- [X] T018 [P] [US2] Add contract tests for the evaluation request and `201/400/401/403/404/409` responses against `openapi.yaml` in `test/contracts/evaluations.test.js`

### Implementation for User Story 2

- [X] T019 [US2] Implement `createEvaluation` in `src/services/jobs.js` with ownership, role, closure, attendance, duplicate, and immutability checks after T016–T018 are failing tests
- [X] T020 [US2] Implement `POST /applications/:id/evaluation` in `src/routes/jobs.js` using the validation schema and service from T005 and T019
- [X] T021 [US2] Integrate evaluation eligibility with existing closure and attendance records in `src/services/control.js` and `src/services/jobs.js` without moving hour accreditation into evaluation
- [X] T022 [US2] Return only contract-approved evaluation data to the owning encargado in `src/routes/jobs.js`; preserve existing application and attendance response shapes

**Checkpoint**: US2 is independently testable after T016–T018 fail first and T019–T022 pass.

---

## Phase 5: User Story 3 - Administrator Hour Compliance (Priority: P3)

**Goal**: `ADMIN` users can view institutional hour compliance without receiving evaluation scores.

**Independent Test**: The administrative compliance endpoint returns one response containing becario identity, required minutes, credited minutes, remaining minutes, and completion status; `BECARIO` and `ENCARGADO` requests are rejected and no evaluation fields are present.

### Tests for User Story 3

- [X] T023 [P] [US3] Add integration tests for administrative compliance authorization and response fields in `test/control-admin.test.js`
- [X] T024 [P] [US3] Add regression tests proving progress and history remain sourced only from attendance accreditation and expose no evaluation scores in `test/control.test.js`

### Implementation for User Story 3

- [X] T025 [US3] Identify and document the administrative compliance endpoint and canonical response fields in `src/routes/control.js` and `openapi.yaml`
- [X] T026 [US3] Verify pending/completed-hour aggregation uses only attendance accreditation in `src/services/control.js`
- [X] T027 [US3] Implement or adjust the single-response administrative compliance result in `src/routes/control.js` without exposing evaluation fields

**Checkpoint**: US3 is independently testable after T023–T024 fail first and T025–T027 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature, security boundaries, performance targets, documentation, and traceability.

- [X] T028 [P] Verify all evaluation endpoints and schemas against the reviewed `openapi.yaml` revision in `test/contracts/evaluations.test.js`
- [X] T029 [P] Run the security audit for role and ownership checks in `src/routes/jobs.js`, `src/services/jobs.js`, and `src/routes/control.js`
- [X] T030 [P] Measure SC-001 and SC-002 using at least 100 jobs, 1,000 applications, and 20 authenticated requests; record p95 results in `specs/001-becas-upb-management/quickstart.md`
- [X] T031 [P] Verify every credited minute is traceable to one closed job, one attendance record, and one accepted application in `test/control.test.js`
- [X] T032 [P] Run the scenarios in `specs/001-becas-upb-management/quickstart.md` and record results
- [X] T033 [P] Update `docs/AI_CONTEXT.md` with the implemented evaluation module status

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (T001–T004) has no feature-code dependency, but T004 blocks all subsequent tasks.
- Phase 2 (T005–T009) depends on T004 and blocks all user stories.
- US1 (T010–T015), US2 (T016–T022), and US3 (T023–T027) depend on Phase 2.
- T028–T033 depend on the desired user stories being complete.

### User Story Dependencies

- US1 can start after Phase 2; it has no dependency on US2 or US3.
- US2 can start after Phase 2; it uses existing attendance data and does not depend on US1 rating aggregation.
- US3 can start after Phase 2; it validates existing hour-compliance behavior independently of rating display.

### Parallel Opportunities

- T001, T002, and T003 can run in parallel.
- T005–T009 can run in parallel after T004, provided they touch different files.
- T010–T012 can run in parallel.
- T016–T018 can run in parallel.
- T023–T024 can run in parallel.
- After all story checkpoints, T028–T033 can run in parallel where files do not overlap.

## Implementation Strategy

### MVP Scope

1. Complete T001–T009.
2. Complete US1 (T010–T015) and validate rating plus hour tracking independently.
3. Stop for review/demo before adding US2 and US3.

### Incremental Delivery

1. Foundation and contract checkpoint.
2. US1: becario rating and hour tracking.
3. US2: encargado evaluation submission.
4. US3: administrator compliance report.
5. Cross-cutting security, performance, contract, and traceability verification.

## Notes

- No task changes frontend code; coordination is limited to contract confirmation with `gestion-de-trabajo-becario-web`.
- Attendance is the only source of credited minutes.
- Evaluations are immutable and never change hours.
- Do not run remote migrations or deployments as part of these tasks.

## Phase 7: Convergence

- [X] T034 [US1] Add an integration regression test that creates an evaluation through `POST /applications/:id/evaluation` and proves credited minutes and progress are unchanged, per T012, FR-010, and SC-005 (partial).
- [X] T035 [P] [US2] Add `test/authorization.test.js` covering the role, account-active, ownership, and self-rating authorization matrix for evaluation, rating, attendance, and administrative compliance, per T016 and FR-009 (missing).
- [X] T036 [US2] Add `test/jobs-evaluation.test.js` covering closed-job eligibility, confirmed attendance, owner-only access, duplicate rejection, 1–5 validation, immutable records, and no-hour-change behavior, per T017 and US2 acceptance scenarios (missing).
- [X] T037 [P] [US2] Add `test/contracts/evaluations.test.js` that validates evaluation request/response shapes and `201/400/401/403/404/409` behavior against `openapi.yaml`, per T018 and Constitution IV (missing).
- [X] T038 [P] [US3] Add `test/control-admin.test.js` covering ADMIN-only compliance access and the single-response fields without evaluation scores, per T023, FR-008, and SC-004 (missing).
- [X] T039 [US3] Add regression assertions that `/me/progress`, student history, owner history, and administrative compliance responses are sourced from attendance only and never expose evaluation fields, per T024, FR-008, and FR-010 (missing).
- [X] T040 [P] Measure SC-001 and SC-002 with at least 100 jobs, 1,000 applications, and 20 authenticated requests; record p95 results and dataset details in `specs/001-becas-upb-management/quickstart.md`, per T030, SC-001, and SC-002 (missing).
- [X] T041 [P] Add automated contract validation for both evaluation endpoints, their schemas, authorization metadata, and documented error responses against the canonical `openapi.yaml`, per T028 and Constitution I/IV (missing).
- [X] T042 Add a traceability test proving every credited minute references one accepted application, one closed job, and one attendance record, and that evaluations are absent from the accreditation path, per T031 and SC-005 (missing).
- [X] T043 [P] Execute the evaluation and rating scenarios in `quickstart.md`, record pass/fail evidence, and update `docs/AI_CONTEXT.md` with the implemented evaluation module status, per T032–T033 (missing).

- [X] T044 [US2] Return each attendance row's `evaluation: Evaluacion | null` from owner-only closed-job attendance and owner history, preserve student/admin response privacy, and cover persistence plus contract shape in `src/services/control.js`, `test/control.test.js`, and `test/contracts/evaluations.test.js`.
