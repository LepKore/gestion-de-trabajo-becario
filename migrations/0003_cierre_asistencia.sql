-- Fase 4: cierre unico por trabajo y asistencia unica por postulacion.
-- Migracion aditiva: conserva todas las postulaciones y usuarios existentes.

ALTER TABLE postulaciones
  ADD COLUMN motivo_rechazo text
  CONSTRAINT postulaciones_motivo_rechazo_valido
    CHECK (motivo_rechazo IS NULL OR (estado = 'RECHAZADA' AND motivo_rechazo = 'CIERRE_TRABAJO'));

CREATE TABLE cierres (
  trabajo_id uuid PRIMARY KEY REFERENCES trabajos(id) ON DELETE RESTRICT,
  encargado_id uuid NOT NULL REFERENCES encargados(usuario_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  respuesta jsonb NOT NULL,
  cerrado_en timestamptz NOT NULL,
  UNIQUE (encargado_id, idempotency_key)
);

CREATE INDEX cierres_encargado_fecha ON cierres(encargado_id, cerrado_en DESC, trabajo_id);

CREATE TABLE asistencias (
  postulacion_id uuid PRIMARY KEY REFERENCES postulaciones(id) ON DELETE RESTRICT,
  trabajo_id uuid NOT NULL REFERENCES cierres(trabajo_id) ON DELETE RESTRICT,
  asistio boolean NOT NULL,
  minutos_acreditados integer NOT NULL CHECK (
    (asistio AND minutos_acreditados > 0 AND minutos_acreditados % 6 = 0)
    OR (NOT asistio AND minutos_acreditados = 0)
  ),
  registrado_por uuid NOT NULL REFERENCES encargados(usuario_id) ON DELETE RESTRICT,
  registrado_en timestamptz NOT NULL
);

CREATE INDEX asistencias_trabajo ON asistencias(trabajo_id, postulacion_id);
