-- MiBeca: migración inicial del dominio (Fase 1 y 2).
-- Convenciones: UUID, UTC, duraciones en minutos enteros.
-- No se usa Prisma; el historial vive en schema_migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --- Usuarios ---------------------------------------------------------------
CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(btrim(nombre)) >= 3 AND length(nombre) <= 120),
  correo text NOT NULL,
  password_hash text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('ADMIN', 'ENCARGADO', 'BECARIO')),
  activo boolean NOT NULL DEFAULT true,
  requiere_cambio_password boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_correo_formato CHECK (correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT usuarios_correo_normalizado CHECK (correo = lower(btrim(correo)))
);

-- El correo se almacena normalizado: la unicidad es insensible a mayúsculas.
CREATE UNIQUE INDEX usuarios_correo_unico ON usuarios (lower(correo));
CREATE INDEX usuarios_rol_activo ON usuarios (rol) WHERE activo;

-- --- Estudiante (perfil de BECARIO) ---------------------------------------
CREATE TABLE estudiantes (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios (id) ON DELETE RESTRICT,
  codigo text NOT NULL CHECK (codigo ~ '^[0-9]{5}$'),
  carrera text NOT NULL CHECK (length(btrim(carrera)) >= 2 AND length(carrera) <= 120),
  semestre integer NOT NULL CHECK (semestre >= 1 AND semestre <= 12),
  meta_minutos integer NOT NULL CHECK (meta_minutos > 0 AND meta_minutos % 6 = 0)
);

-- El código se trata siempre como texto para conservar ceros iniciales.
CREATE UNIQUE INDEX estudiantes_codigo_unico ON estudiantes (codigo);

-- --- Encargado (perfil de ENCARGADO) ---------------------------------------
CREATE TABLE encargados (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios (id) ON DELETE RESTRICT,
  contexto_tipo text NOT NULL CHECK (contexto_tipo IN ('MATERIA', 'FACULTAD', 'AREA')),
  contexto_nombre text NOT NULL CHECK (length(btrim(contexto_nombre)) >= 2 AND length(contexto_nombre) <= 120)
);

-- --- Sesiones opacas de servidor -------------------------------------------
CREATE TABLE sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  csrf_token text NOT NULL,
  user_agent text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL,
  revocado_en timestamptz
);

-- Solo se guarda el hash del token: la cookie es el único portador del secreto.
CREATE UNIQUE INDEX sesiones_token_unico ON sesiones (token_hash);
CREATE INDEX sesiones_usuario_activas ON sesiones (usuario_id) WHERE revocado_en IS NULL;

-- --- Auditoría --------------------------------------------------------------
CREATE TABLE auditoria (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  accion text NOT NULL CHECK (length(btrim(accion)) >= 3),
  recurso text NOT NULL CHECK (length(btrim(recurso)) >= 1),
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_actor_creado ON auditoria (actor_id, creado_en DESC);