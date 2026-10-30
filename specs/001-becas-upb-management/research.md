# Research: UPB Becario Work and Hours Management Platform

## Decisions

### Decision: Runtime, Dependencies, and Test Runner
**Rationale**: The repository declares JavaScript ESM with Node.js `>=22`, and Node.js 24.19.0 was verified locally. `package.json` uses Express 5.3, PostgreSQL through `pg`, zod 4, argon2, cookie-parser and helmet. Tests run with the built-in `node:test` command. Vitest is not installed, so adding it would violate the project's incremental/YAGNI constraint for this feature.

### Decision: Quality Gate Baseline
**Rationale**: The constitution requires lint, build, and unit/integration tests. The repository currently provides `npm run check`, `npm test`, and `npm run build`, but no `npm run lint`. The implementation plan treats lint as a blocking setup task rather than silently marking the gate complete. Contract validation and the repository audit remain required checks.

### Decision: Cross-Repository Contract Checkpoint
**Rationale**: `openapi.yaml` is the backend's canonical contract and the frontend consumes it from the sibling repository. Evaluation implementation cannot be considered integrated until the web consumer has reviewed or synchronized against the contract.

### Decision: Rating Window and Eligibility
**Rationale**: The visible rating considers evaluations available among the last 10 trabajos realizados. A trabajo realizado requires a closed job and confirmed attendance. With fewer than 10 trabajos realizados, return `faltan realizar trabajos`; unevaluated jobs are not averaged as zero.

The window is selected by job closure time descending, with application UUID as a deterministic tie-breaker. The system selects the last 10 trabajos realizados first. Jobs without an evaluation remain part of the window but contribute no numeric value to the average; they are never treated as zero.

### Decision: 4-Criteria Evaluation
**Rationale**: The business requirement specifies 4 distinct metrics: Responsabilidad, Puntualidad, Proactividad, and Comunicación. Each must be an integer from 1 to 5.

### Decision: Evaluation Trigger
**Rationale**: Evaluations are only permitted for closed jobs and only for becarios whose attendance has been confirmed. This prevents premature or invalid evaluations.

### Decision: Separation from Hours and Administrative Reports
**Rationale**: Attendance is the sole source of credited minutes. Evaluation stores only four criteria and their average. Administrator reports expose compliance/hours, not evaluation scores.

### Decision: Immutable Evaluation and No Cancellation
**Rationale**: This feature creates one evaluation per attended application and exposes no edit/delete operation. Job cancellation and post-close correction are deferred; invalid excess-hour requests fail atomically.

## Alternatives Considered

### Alternative: Moving Average in Application Logic
**Rejected Because**: Application-side calculation would be less efficient and would make the eligibility/window rules harder to enforce consistently.

### Alternative: Global Average (All History)
**Rejected Because**: A global average violates the last-10-realized-jobs window and includes stale history indefinitely.
