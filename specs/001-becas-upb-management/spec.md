# Feature Specification: UPB Becario Work and Hours Management Platform

**Feature Branch**: `001-becas-upb-management`

**Created**: 2026-03-30

**Status**: Draft

**Input**: User description: "Ya esta realizado el constitution en backend, ahora para aclarar el contexto de este proyecto. Este proyecto (web y backend) consiste en una aplicacion web con el fin de ayudar a los becarios de la UPB (universidad privada boliviana) a poder encontrar trabajo becario y gestionar las horas becarias que le falten. Para los encargados, esta app les ayuda a controlar mejor que becarios trabajaran en los trabajos becarios que estos generen y poder dar una calificacion a los becarios que participaron. Y para el administrador, que pueda controlar que becarios cumplieron sus horas becarias o a que becarios les falta por cumplir. Revisa el spec 001 de web para poder trabajar a la par"

## Clarifications

### Session 2026-03-30

- Q: What specific criteria should an encargado evaluate for each becario? → A: Responsabilidad, Puntualidad, Proactividad, and Comunicación (each 1-5).
- Q: At what point in the workflow should the evaluation be recorded? → A: After the job is closed and only for becarios marked as having attended.
- Q: How is the visible rating calculated? → A: From evaluations available among the last 10 trabajos realizados. A trabajo realizado is a closed job with confirmed attendance; if fewer than 10 trabajos realizados exist, show `faltan realizar trabajos`.
- Q: Does evaluation affect credited hours or administrative reports? → A: No. Attendance credits hours; evaluation only stores the four criteria and their average. Administrators see hour compliance only, not ratings.
- Q: Are cancellation and post-close hour corrections included? → A: No. Cancellation is out of scope. Attempts to credit hours above the job limit are rejected without modifying closed data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Becario Job Discovery and Hour Tracking (Priority: P1)

UPB scholars (becarios) need to browse available scholarship work opportunities, apply for them, and monitor their completed versus remaining required scholarship hours.

**Why this priority**: Core value proposition for the primary end-user (becarios) to fulfill their scholarship requirements.

**Independent Test**: Can be tested by creating scholarship job postings, logging in as a becario, applying for a job, and verifying hour tracking displays correct remaining hours.

**Acceptance Scenarios**:

1. **Given** a becario with missing scholarship hours, **When** they view the available scholarship jobs list, **Then** they see open job postings created by encargados.
2. **Given** an open job posting, **When** a becario applies for it, **Then** their application is registered for the encargado's review.
3. **Given** a logged-in becario, **When** they check their profile dashboard, **Then** they see total required hours, completed hours, and remaining hours.

---

### User Story 2 - Encargado Job Posting and Becario Evaluation (Priority: P2)

Work supervisors (encargados) need to publish scholarship job opportunities, manage assigned becarios, and evaluate their performance upon completion using 4 criteria (Responsabilidad, Puntualidad, Proactividad, and Comunicación).

**Why this priority**: Essential for supervisors to generate work opportunities and grade participating becarios.

**Independent Test**: Can be tested by logging in as an encargado, creating a job, reviewing applicants, closing it with exhaustive attendance, and submitting 4 ratings for an attended becario.

**Acceptance Scenarios**:

1. **Given** an authenticated encargado, **When** they submit a new job posting with title, description, and required hours, **Then** the job becomes visible to becarios.
2. **Given** applicant submissions for a job, **When** an encargado selects and assigns becarios, **Then** the working relationship is established.
3. **Given** a closed job with a becario marked as attended, **When** the encargado submits the four ratings, **Then** the values and average are recorded; credited hours remain determined exclusively by attendance closure.

---

### User Story 3 - Administrator Hour Compliance Monitoring (Priority: P3)

System administrators need an overview to monitor overall scholarship hour compliance across all becarios, identifying who has completed their requirements and who is lagging.

**Why this priority**: Enables institutional oversight and administrative control over the entire scholarship program.

**Independent Test**: Can be tested by logging in as an admin and viewing the compliance summary dashboard showing complete/incomplete status for all becarios.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator, **When** they access the compliance dashboard, **Then** they see a filtered list of becarios categorized by completion status (completed vs. pending hours).
2. **Given** a specific becario's record, **When** the administrator inspects it, **Then** they see assigned jobs and hours worked, without evaluation scores.

---

### Edge Cases

- If a becario applies for a job whose declared duration exceeds the remaining hours, the application is allowed because application does not accredit hours. At closure, attendance accreditation follows the job duration and progress may exceed the target; no partial or evaluation-based adjustment is performed.
- Job cancellation is out of scope for this feature.
- An operation that would credit hours above the job duration is rejected without modifying closed data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow becarios to view active scholarship job listings and track their completed versus remaining scholarship hours.
- **FR-002**: System MUST allow becarios to apply for available scholarship jobs.
- **FR-003**: System MUST allow encargados to create and update editable fields of their own job postings while status is `PUBLICADO`, and close them exactly once. Post-close edits and cancellation are out of scope.
- **FR-004**: System MUST allow encargados to select and assign applicants to their job postings.
- **FR-005**: System MUST allow encargados to mark attendance for assigned becarios once a job is closed.
- **FR-006**: System MUST allow encargados to evaluate attended becarios across 4 criteria: Responsabilidad, Puntualidad, Proactividad, and Comunicación (values 1 to 5).
- **FR-007**: System MUST calculate and display a becario's average rating using evaluations available among the last 10 trabajos realizados. A trabajo realizado is a closed job with confirmed attendance; fewer than 10 yields "faltan realizar trabajos".
- **FR-008**: System MUST allow administrators to view global compliance reports tracking becario hour completion status.
- **FR-009**: System MUST enforce role-based access control distinguishing between becarios, encargados, and administrators.
- **FR-010**: Evaluation MUST NOT create, alter, or remove credited minutes.
- **FR-011**: Evaluations are immutable in this feature; no edit or delete operation is exposed.

The FR-007 rating algorithm MUST:
1. Select jobs with status `CERRADO` and confirmed attendance for the authenticated becario.
2. Order them by closure timestamp descending and application UUID ascending as a deterministic tie-breaker.
3. Select the first 10 realized jobs.
4. Average only evaluations that exist for those jobs.
5. Never treat a missing evaluation as zero.
6. Return `rating: null` and `message: "faltan realizar trabajos"` when fewer than 10 realized jobs exist.

### Key Entities *(include if feature involves data)*

- **Becario**: Represents a UPB student holding a scholarship, tracking required hours, completed hours, and a rating derived from available evaluations on the last 10 trabajos realizados.
- **Encargado**: Represents a university supervisor or staff member who creates scholarship jobs and evaluates participants.
- **Administrator**: Represents managerial staff overseeing the entire program compliance.
- **Job Posting**: Represents a scholarship work opportunity with description, declared duration, status (`PUBLICADO`, `CERRADO`), and creator reference.
- **Evaluation**: Contains 4 numeric ratings (1-5) and an automatically calculated average for a specific becario's performance on a specific job.
- **Application / Assignment**: Links a becario to a job posting, tracking `PENDIENTE`, `ACEPTADA` or `RECHAZADA`; attendance/accreditation is a separate record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a local test dataset containing at least 100 jobs and 1,000 applications, the job-listing and progress endpoints MUST complete within 2 seconds at p95 across 20 authenticated requests.
- **SC-002**: Encargados can successfully evaluate a becario across all 4 criteria in under 30 seconds, and the API request responds within 500 ms at p95 under the local integration-test dataset.
- **SC-003**: Average ratings correctly reflect available evaluations among the last 10 trabajos realizados, with the required message when fewer than 10 exist.
- **SC-004**: Administrators can generate a complete institutional hour compliance report in a single view.
- **SC-005**: 100% of credited scholarship hours are traceable to validated attendance closure and job assignment; evaluations do not participate in accreditation.

## Assumptions

- Target users (becarios, encargados, admins) have active institutional UPB accounts.
- Initial scholarship hour quotas are pre-loaded or assigned by administrators upon student enrollment.
- The web frontend and backend API repositories synchronize via canonical API contracts defined in `openapi.yaml`.
- Notification systems (email/push) are secondary enhancements out of scope for the initial core workflow.
