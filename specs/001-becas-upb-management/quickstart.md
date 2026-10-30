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
