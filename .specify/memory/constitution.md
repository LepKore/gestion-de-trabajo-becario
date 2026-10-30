<!--
Sync Impact Report:
- Version change: 1.1.0 → 1.0.0
- Replaced: "MiBeca Dual-Repository Constitution" with "MiBeca Backend API Constitution" - focused constitution for backend API domain only
- Modified principles: II. Synchronized Cross-Repository Progression (clarified backend-specific coordination)
- Follow-up TODOs: Ensure frontend repository constitution continues to provide cross-repository coordination rules.
-->

# MiBeca Backend API Constitution

## Core Principles

### I. Canonical API & Integration
Backend API endpoints and data contracts are canonical and shared with the frontend repository (`gestion-de-trabajo-becario-web`). API schemas and interface definitions must be complete and consistent; no backend may define independent mock contracts once integration is underway.

### II. Synchronized Cross-Repository Progression
Backend development MUST proceed in coordination with the web repository. When a backend task is blocked by an incomplete web task, developers MUST pivot to advancing the blocking web task's queue until unblocked, and vice-versa.
- *Rule:* If Backend Task N cannot continue because Web Task M is incomplete, and Web Task M requires preceding tasks, continue sequentially on web tasks until web progress is blocked by a backend dependency, and vice-versa.

### III. Test-First & Quality Gates (NON-NEGOTIABLE)
All features, contract integrations, and bug fixes MUST adhere to test-driven development and strict quality gates (`npm run lint`, `npm run build`, and unit/integration tests). No bypassing of checks, lint suppressions, or stubbing without tests is permitted.

### IV. Integration Testing & Contract Verification
Focus areas requiring integration tests: New API endpoint tests, Contract changes, Inter-service communication, Shared schemas between backend and web repositories.

### V. Simplicity, YAGNI & Incremental Delivery
Deliver work in thin, verifiable, atomic slices. Avoid over-engineering, unrequested abstractions, or parallel custom specs. Every endpoint or service must directly serve the MVP plan.

## Development Workflow & Review Process

1. **Code Review & Quality:** All changes must pass linting, type checking, and test suites locally before PR submission.
2. **Security & Auth:** Backend enforces actual authorization and role security; frontend respects these permissions without client-side permission bypasses.
3. **Documentation:** Architectural decisions, API contract modifications, and core changes must be recorded in project documentation.

## Governance

This Constitution supersedes all other practices and informal guidelines across both MiBeca repositories. Amendments require documentation, explicit team agreement, and a migration plan. Compliance is verified during code reviews, automated PR quality gates, and spec validation.

**Version**: 1.0.0 | **Ratified**: 2026-03-30 | **Last Amended**: 2026-03-30
