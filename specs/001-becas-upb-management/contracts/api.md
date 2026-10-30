# API Contracts: Evaluations & Ratings

## POST /applications/:id/evaluation
Evaluates a student's performance for a specific application/job assignment.

**Prerequisites**:
- Authenticated as `ENCARGADO`
- Job is `CERRADO`
- Application is `ACEPTADA` and its attendance record has `asistio: true`
- Requester is the owner of the job

**Request Body**:
```json
{
  "responsabilidad": 5,
  "puntualidad": 4,
  "proactividad": 5,
  "comunicacion": 4
}
```

**Success Response (201 Created)**:
```json
{
  "id": "uuid",
  "postulacion_id": "uuid",
  "promedio": 4.5,
  "creado_en": "ISO8601"
}
```

## GET /me/rating
Retrieves the authenticated becario's rating from evaluations available among the last 10 trabajos realizados (closed jobs with confirmed attendance).

`GET /me/rating` is the canonical endpoint for the becario's aggregate rating. `GET /me/applications` does not duplicate aggregate rating data unless the canonical `openapi.yaml` contract explicitly adds an additive field.

**Prerequisites**:
- Authenticated as `BECARIO`

**Success Response (200 OK)**:
```json
{
  "rating": 4.5,
  "trabajosRealizados": 12,
  "evaluacionesConsideradas": 10,
  "message": null
}
```
*Note: If `trabajosRealizados < 10`, `rating` is `null` and `message` is `"faltan realizar trabajos"`. Unevaluated realized jobs are not averaged as zero.*

The window is ordered by job closure time descending, with application UUID as a deterministic tie-breaker. The last 10 realized jobs are selected before excluding missing evaluations from the numeric average.

### Authorization matrix

| Operation | BECARIO | ENCARGADO | ADMIN |
|---|---:|---:|---:|
| View published jobs | Yes | Yes | Yes |
| Apply to a job | Own account | No | No |
| Mark attendance | No | Own jobs only | No |
| Create evaluation | No | Own closed jobs only | No |
| View own rating | Own rating only | No | No |
| View compliance report | No | No | Yes |
| Edit/delete evaluation | No | No | No |

## Contract rules
- There is at most one evaluation per application; a duplicate returns `409`.
- No evaluation update or delete endpoint exists in this feature.
- Evaluation never changes attendance or credited minutes.
- Administrator compliance endpoints expose hours/status only and do not expose evaluation scores.
- The canonical contract is `openapi.yaml`; this supplement must remain synchronized with it.
