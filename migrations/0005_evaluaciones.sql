-- Evaluación única e inmutable por postulación asistida.
CREATE TABLE evaluaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postulacion_id uuid NOT NULL UNIQUE REFERENCES postulaciones(id) ON DELETE RESTRICT,
  evaluador_id uuid NOT NULL REFERENCES encargados(usuario_id) ON DELETE RESTRICT,
  responsabilidad integer NOT NULL CHECK (responsabilidad BETWEEN 1 AND 5),
  puntualidad integer NOT NULL CHECK (puntualidad BETWEEN 1 AND 5),
  proactividad integer NOT NULL CHECK (proactividad BETWEEN 1 AND 5),
  comunicacion integer NOT NULL CHECK (comunicacion BETWEEN 1 AND 5),
  promedio numeric(3,2) GENERATED ALWAYS AS ((responsabilidad + puntualidad + proactividad + comunicacion) / 4.0) STORED,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX evaluaciones_evaluador_fecha ON evaluaciones(evaluador_id, creado_en DESC, id);
