-- Fase 3: aditiva, conserva usuarios e historial existente.
CREATE TABLE trabajos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encargado_id uuid NOT NULL REFERENCES encargados(usuario_id) ON DELETE RESTRICT,
  titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 3 AND 120),
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 3 AND 4000),
  ubicacion text NOT NULL CHECK (length(btrim(ubicacion)) BETWEEN 2 AND 200),
  contexto_tipo text NOT NULL CHECK (contexto_tipo IN ('MATERIA','FACULTAD','AREA')),
  contexto_nombre text NOT NULL CHECK (length(btrim(contexto_nombre)) BETWEEN 2 AND 120),
  inicio_previsto timestamptz NOT NULL,
  fin_previsto timestamptz NOT NULL CHECK (fin_previsto > inicio_previsto),
  duracion_minutos integer NOT NULL CHECK (duracion_minutos > 0 AND duracion_minutos % 6 = 0),
  cupos integer NOT NULL CHECK (cupos > 0),
  estado text NOT NULL DEFAULT 'PUBLICADO' CHECK (estado IN ('PUBLICADO','CERRADO')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trabajos_encargado_inicio ON trabajos(encargado_id, inicio_previsto, id);
CREATE INDEX trabajos_estado_inicio ON trabajos(estado, inicio_previsto, id);
CREATE TABLE postulaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES trabajos(id) ON DELETE RESTRICT,
  estudiante_id uuid NOT NULL REFERENCES estudiantes(usuario_id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACEPTADA','RECHAZADA')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trabajo_id, estudiante_id)
);
CREATE INDEX postulaciones_trabajo_estado ON postulaciones(trabajo_id, estado);
CREATE INDEX postulaciones_estudiante_fecha ON postulaciones(estudiante_id, creado_en, id);
