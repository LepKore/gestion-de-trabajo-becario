# Data Model: UPB Becario Work and Hours Management Platform

## Entities

### Job Posting
- `id`: uuid (PK)
- `title`: string
- `description`: text
- `duracion_minutos`: integer (declared duration used by attendance accreditation)
- `status`: enum (`PUBLICADO`, `CERRADO`)
- `encargado_id`: uuid (FK -> Encargados)
- `created_at`: timestamptz

### Becario
- `usuario_id`: uuid (PK, FK -> Users)
- `meta_minutos`: integer
- `acreditados`: integer (calculated or stored exclusively from confirmed attendance)
- `contexto_tipo`: string
- `contexto_nombre`: string

### Application / Assignment
- `id`: uuid (PK)
- `job_id`: uuid (FK -> Job Posting)
- `becario_id`: uuid (FK -> Becario)
- `status`: enum (`PENDIENTE`, `ACEPTADA`, `RECHAZADA`)
- Attendance/accreditation: separate one-per-accepted-application record with `asistio`, `minutos_acreditados`, actor and closure timestamp; minutes are set only during job closure and never by evaluation.
- `created_at`: timestamptz

### Evaluation
- `id`: uuid (PK)
- `postulacion_id`: uuid (FK -> Application, UNIQUE)
- `evaluador_id`: uuid (FK -> Encargado)
- `responsabilidad`: integer (1-5)
- `puntualidad`: integer (1-5)
- `proactividad`: integer (1-5)
- `comunicacion`: integer (1-5)
- `promedio`: numeric (calculated: (res + pun + pro + com) / 4)
- `creado_en`: timestamptz
- Evaluation is immutable in this feature: no update or delete operation is exposed.

## Relationships
- **Encargado -> Job Posting**: One-to-Many
- **Job Posting -> Application**: One-to-Many
- **Becario -> Application**: One-to-Many
- **Application -> Evaluation**: One-to-One (via `postulacion_id`)

## Validation Rules
- `evaluacion.responsabilidad`: MUST be 1-5
- `evaluacion.puntualidad`: MUST be 1-5
- `evaluacion.proactividad`: MUST be 1-5
- `evaluacion.comunicacion`: MUST be 1-5
- `postulacion.status`: MUST be `ACEPTADA` and its attendance record MUST have `asistio = true` before evaluation can be created
- `job.status`: MUST be `CERRADO` before evaluation can be created
- Evaluation MUST NOT create or modify attendance, `minutos_acreditados`, or any student hour total.
- A closure/accreditation request exceeding the job duration MUST be rejected atomically without modifying closed data.
- Evaluation MUST be immutable: no update or delete operation is exposed.
- Administrative compliance views MUST derive only from attendance accreditation and MUST NOT expose evaluation scores.
- Owner-authorized closed-job attendance and owner history MUST include `evaluation: Evaluacion | null`; student and administrative history MUST omit evaluation data.
- The rating window selects the 10 most recent realized jobs (closed plus confirmed attendance) before averaging available evaluations; missing evaluations are excluded from the numeric average, not treated as zero.
