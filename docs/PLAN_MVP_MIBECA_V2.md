# MiBeca — MVP v2: specs realizables

> Fecha: 23 de octubre de 2026 · Versión: 2.0 · Documento: `docs/PLAN_MVP_MIBECA_V2.md` (ambos repos)
> Autoridad: este documento define el alcance. `openapi.yaml` es el contrato canónico de la API.

Este MVP sucede al v1 y cambia dos cosas de su alcance: las calificaciones dejan de estar fuera y la taxonomía de contextos del rol `ENCARGADO` se sustituye. Todo lo demás del v1 sigue vigente (sesiones opacas, cupos, cierre único, horas en minutos, permisos, auditoría).

---

## 1. Decisiones confirmadas

| # | Decisión |
|---|---|
| 1 | La puntuación de un trabajo es el **promedio de las 4 calificaciones**: Responsabilidad, Puntualidad, Proactividad y Comunicación, cada una de 1 a 5. |
| 2 | **Trabajo realizado** = trabajo cerrado con `asistencias.asistio = true`. Una aceptación sin asistencia no cuenta. |
| 3 | La evaluación se captura **después del cierre**, en un formulario separado, una vez por estudiante asistido. |
| 4 | El documento se guarda como **`docs/PLAN_MVP_MIBECA_V2.md`** en ambos repos; el v1 se conserva. |
| 5 | El rol interno sigue siendo **`ENCARGADO`**; solo cambian los valores de contexto y las etiquetas visibles. |
| 6 | Una evaluación por postulación, sin edición ni borrado en el MVP. |
| 7 | Calificación visible = promedio de las evaluaciones de los últimos 10 trabajos realizados. Con menos de 10, mensaje exacto **`faltan realizar trabajos`**. |
| 8 | Sin dependencias nuevas en backend ni frontend. |

---

## 2. Mapa de capacidades

| Module id | Responsabilidad | Depende de |
|---|---|---|
| `contextos` | Sustituir `MATERIA/FACULTAD/AREA` por `PLANTEL_ADMINISTRATIVO/JEFE_CARRERA`, con área o carrera de texto libre | — |
| `evaluaciones` | Modelo, endpoints, promedio de últimos 10, filtros por calificación y horas pendientes | `contextos` |
| `evaluaciones-ui` | Formulario, estrellas, resumen del becario, columnas y filtros de postulaciones | `evaluaciones` |

Orden de dependencia: `contextos` → `evaluaciones` → `evaluaciones-ui`.
La interfaz puede construirse contra el contrato de este documento antes de que el backend esté listo; la integración real ocurre cuando `evaluaciones` pasa sus pruebas.

---

## 3. Base compartida

### Stack

- Backend: Node.js ≥22, Express 5, PostgreSQL, zod 4, `node --test`, migraciones SQL en `migrations/`.
- Frontend: React 19, Vite 8, React Router 7, Vitest 5 + Testing Library, JavaScript/JSX.
- Sin ORM, sin JWT, sin nuevas librerías.

### Comandos

| Repo | Verificación |
|---|---|
| Backend | `npm run check` · `npm test` · `npm run db:migrate` |
| Frontend | `npm run lint` · `npm test` · `npm run build` |

### Estructura relevante

```
backend/
  migrations/            → 0004_contextos.sql, 0005_evaluaciones.sql
  src/lib/               → esquemas zod
  src/services/          → consultas y reglas
  src/routes/            → endpoints
  test/                  → pruebas de API y servicios
web/
  src/api/endpoints.js   → única fuente de URLs
  src/components/ui.jsx  → componentes compartidos
  src/pages/             → pantallas
  test/                  → pruebas de componentes
```

### Estilo

El código sigue el patrón existente: esquema zod estricto, servicio que recibe `pool`, ruta que parsea y delega, error con helper de `src/lib/errors.js`.

```js
// src/lib/jobs-validation.js
export const evaluationSchema = z.object({
  responsabilidad: z.number().int().min(1).max(5),
  puntualidad: z.number().int().min(1).max(5),
  proactividad: z.number().int().min(1).max(5),
  comunicacion: z.number().int().min(1).max(5),
}).strict()

// src/routes/jobs.js
router.post('/applications/:id/evaluation', ...auth, owner, write,
  handle(async (req, res, pool) => res.status(201).json({
    data: await createEvaluation(pool, id(req), parse(evaluationSchema, req.body), req.usuario.id),
  })))
```

### Reglas de contrato

- `openapi.yaml` se actualiza a **1.5.0** y es el único contrato que consume el frontend.
- Ninguna URL se escribe fuera de `src/api/endpoints.js` (`test/endpoints.test.js` lo verifica).
- Cada migración tiene un solo propietario y no se edita después de aplicada.

---

## 4. Spec `contextos`

### Objetivo

Que "plantel administrativo" y "jefe de carrera" sean el mismo rol con distinto contexto, sin duplicar permisos:

- `PLANTEL_ADMINISTRATIVO` → campo **Área** de texto libre (*Admisiones*, *Encargado de Deportes*).
- `JEFE_CARRERA` → campo **Carrera** de texto libre (*Ingeniería de Sistemas Computacionales*, *Derecho*).

### Dentro del alcance

- Migración de los valores existentes y del `CHECK` en `encargados` y `trabajos`.
- Alta y edición de cuentas con el campo correcto según el contexto.
- Etiquetas legibles en lista de usuarios, panel y trabajos.

### Fuera del alcance

- Renombrar la tabla `encargados` o el rol `ENCARGADO`.
- Crear dos roles separados o permisos distintos.
- Añadir más contextos.

### Contrato de datos

`migrations/0004_contextos.sql`:

1. Quitar el `CHECK` viejo de `encargados.contexto_tipo` y `trabajos.contexto_tipo`.
2. Convertir: `AREA` y `MATERIA` → `PLANTEL_ADMINISTRATIVO`; `FACULTAD` → `JEFE_CARRERA`.
3. Añadir `CHECK (contexto_tipo IN ('PLANTEL_ADMINISTRATIVO','JEFE_CARRERA'))` en ambas tablas.
4. Mantener `contexto_nombre` como área o carrera; sin renombrar columnas.

### Contrato de API

- `contextoTipo` acepta solo los dos valores nuevos; el resto devuelve 400.
- `serializeUsuario` conserva `encargado: {contextoTipo, contextoNombre}`.
- `createJob` sigue copiando el contexto del perfil al trabajo.

### Contrato de UI

- `src/lib/contextos.js` (nuevo): `CONTEXTOS` con `{valor, etiqueta, campo, ejemplo}` y `etiquetaContexto(tipo)`.
- `AdminUsuarios.jsx`: opción de rol "Plantel administrativo / Jefe de carrera"; selector de contexto; label y placeholder dinámicos (`Área`/`Carrera`); `FORMULARIO_VACIO` inicia en `PLANTEL_ADMINISTRATIVO`.
- `Panel.jsx` y `Trabajos.jsx`: usan `etiquetaContexto` en lugar de mostrar el enum crudo.

### Criterios de aceptación

- Alta con `PLANTEL_ADMINISTRATIVO` + `Admisiones` se guarda y se muestra como "Plantel administrativo · Admisiones".
- Alta con `JEFE_CARRERA` + `Ingeniería de Sistemas Computacionales` se guarda y se muestra como "Jefe de carrera · Ingeniería de Sistemas Computacionales".
- `MATERIA`, `FACULTAD` y `AREA` devuelven 400.
- Las filas existentes migran sin pérdida y los trabajos conservan su contexto.
- Editar un perfil mantiene el tipo y el nombre libre.

### Verificación

`npm run db:migrate` sobre copia local, `npm run check`, `npm test`; en web `npm run lint`, `npm test`, `npm run build`; alta manual de ambas cuentas.

### Propiedad

Integrante **A**. Archivos: `migrations/0004_contextos.sql`, `src/lib/validation.js`, `src/services/users.js`, `test/api.test.js`.

---

## 5. Spec `evaluaciones`

### Objetivo

Permitir que el encargado califique a cada becario asistido después del cierre y que el sistema calcule una calificación estable de 1 a 5 sobre los últimos 10 trabajos realizados.

### Dentro del alcance

- Tabla `evaluaciones` y su migración.
- Endpoint de creación y consulta de la calificación propia.
- Agregado de calificación en listados de postulaciones y asistencia.
- Filtros `minRating` y `conHorasPendientes`.

### Fuera del alcance

- Editar o borrar evaluaciones.
- Comentarios, denuncias o reputación pública.
- Evaluar trabajos no cerrados o estudiantes no asistidos.
- Backfill de evaluaciones históricas.

### Contrato de datos

`migrations/0005_evaluaciones.sql`:

```sql
CREATE TABLE evaluaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postulacion_id uuid NOT NULL UNIQUE REFERENCES postulaciones(id) ON DELETE RESTRICT,
  evaluador_id uuid NOT NULL REFERENCES encargados(usuario_id) ON DELETE RESTRICT,
  responsabilidad smallint NOT NULL CHECK (responsabilidad BETWEEN 1 AND 5),
  puntualidad smallint NOT NULL CHECK (puntualidad BETWEEN 1 AND 5),
  proactividad smallint NOT NULL CHECK (proactividad BETWEEN 1 AND 5),
  comunicacion smallint NOT NULL CHECK (comunicacion BETWEEN 1 AND 5),
  promedio numeric(3,2) GENERATED ALWAYS AS (
    round((responsabilidad + puntualidad + proactividad + comunicacion)::numeric / 4, 2)
  ) STORED,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluaciones_evaluador ON evaluaciones(evaluador_id, creado_en DESC);
```

`UNIQUE (postulacion_id)` impide dos evaluaciones del mismo trabajo y estudiante.

### Reglas de negocio

- Solo evalúa el `ENCARGADO` propietario del trabajo.
- El trabajo debe estar `CERRADO`.
- La postulación debe estar `ACEPTADA` y su asistencia `asistio = true`.
- El cuerpo debe traer los 4 enteros 1–5; `promedio` lo calcula la base.
- Duplicado → 409; no propietario → 403; trabajo abierto, no aceptado o no asistido → 409.

### Cálculo de la calificación

- `trabajosRealizados` = cantidad de postulaciones del estudiante con `asistencias.asistio = true`.
- Si `< 10` → `rating = null`, `message = 'faltan realizar trabajos'`.
- Si `>= 10` → `rating = round(avg(promedio), 2)` de las evaluaciones de los últimos 10 trabajos realizados, ordenadas por `evaluaciones.creado_en DESC`.
- Si hay 10 trabajos pero ninguna evaluación → `rating = null`, `message = null`; la interfaz muestra "Sin calificaciones".

El agregado se calcula en SQL dentro de `listApplications` con un `LEFT JOIN LATERAL` y un `WITH base`, para filtrar antes de paginar:

```sql
LEFT JOIN LATERAL (
  SELECT round(avg(ev.promedio), 2)::numeric(3,2) AS rating,
         count(ev.id)::int AS evaluadas
  FROM (
    SELECT e2.promedio, e2.id
    FROM evaluaciones e2
    JOIN postulaciones p2 ON p2.id = e2.postulacion_id
    JOIN asistencias a2 ON a2.postulacion_id = p2.id AND a2.asistio
    WHERE p2.estudiante_id = p.estudiante_id
    ORDER BY e2.creado_en DESC
    LIMIT 10
  ) ev
) cal ON true
```

### Contrato de API (`openapi.yaml` 1.5.0)

| Endpoint | Rol | Respuesta |
|---|---|---|
| `POST /applications/{id}/evaluation` | `ENCARGADO` propietario | 201 `{id, applicationId, evaluadorId, responsabilidad, puntualidad, proactividad, comunicacion, promedio, creadoEn}` |
| `GET /me/rating` | `BECARIO` | `{rating, trabajosRealizados, evaluacionesConsideradas, message}` |
| `GET /jobs/{id}/attendance` | `ENCARGADO` propietario | Cada elemento añade `evaluation: {...} | null` |
| `GET /jobs/{id}/applications` | `ENCARGADO` propietario | Cada estudiante añade `rating`, `trabajosRealizados`, `ratingMessage` |

Filtros nuevos, solo en el listado del propietario (el esquema de `/me/applications` no cambia):

- `minRating`: número 1–5. Excluye estudiantes sin calificación (`rating IS NULL`).
- `conHorasPendientes`: `'true'` → `acreditados < meta_minutos`; `'false'` → meta alcanzada o excedida.

### Criterios de aceptación

- Evaluación válida: 4, 5, 4, 3 → `promedio = 4.00`.
- No propietario → 403; trabajo abierto → 409; postulación no aceptada o no asistida → 409; duplicado → 409.
- `GET /me/rating` con 9 trabajos devuelve `faltan realizar trabajos`.
- Con 10 trabajos devuelve el promedio de las evaluaciones de esos 10; con 11, ignora la más antigua.
- `minRating` y `conHorasPendientes` filtran en SQL y la paginación sigue cuadrando.
- `GET /jobs/{id}/attendance` distingue evaluado de no evaluado.

### Verificación

`npm run db:migrate`, `npm run check`, `npm test`. Pruebas nuevas en `test/evaluaciones.test.js` y ampliación de `test/jobs.test.js` y `test/control.test.js`.

### Propiedad

Integrante **B**. Archivos: `migrations/0005_evaluaciones.sql`, `src/lib/jobs-validation.js`, `src/services/jobs.js`, `src/services/control.js`, `src/routes/jobs.js`, `src/routes/control.js`, `openapi.yaml`, `test/evaluaciones.test.js`, `test/jobs.test.js`, `test/control.test.js`.

---

## 6. Spec `evaluaciones-ui`

### Objetivo

Que el encargado evalúe sin fricción después del cierre y que docente y becario vean la calificación en el lugar donde deciden.

### Dentro del alcance

- Componente de estrellas accesible.
- Formulario de 4 criterios sobre un trabajo cerrado.
- Tarjeta de calificación en el panel del becario.
- Columna y filtros de calificación/horas en postulaciones.

### Fuera del alcance

- Mostrar la calificación en la supervisión del administrador.
- Historial detallado de evaluaciones o quién evaluó.
- Animaciones o gráficas.

### Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/components/ui.jsx` | `RatingStars({rating, message})`: 5 estrellas con relleno fraccional, `aria-label` numérico, mensaje exacto cuando `message` existe, "Sin calificaciones" si `rating` es null |
| `src/api/endpoints.js` | `RUTAS.yo.calificacion = '/me/rating'`; `RUTAS.evaluaciones.crear(id)`; `evaluacionesApi.crear`; `calificacionesApi.mia`; `deMisTrabajos(filtros)` pasa `minRating` y `conHorasPendientes` a cada trabajo |
| `src/pages/Control.jsx` | En `AsistenciaCerrada`, acción "Evaluar" por estudiante asistido sin evaluación; Dialog con 4 campos 1–5; evaluación existente en solo lectura |
| `src/pages/Postulaciones.jsx` | Columna "Calificación" y tarjeta móvil; filtros "Calificación mínima" y "Horas becarias"; aviso de que los estudiantes con menos de 10 trabajos no aparecen al filtrar |
| `src/pages/Panel.jsx` | Tarjeta "Mi calificación" en `PanelBecario` con `RatingStars` |
| `src/pages/AdminUsuarios.jsx` | Formulario de contexto de la spec `contextos` |
| `test/evaluaciones.test.jsx` (nuevo) | Estrellas, mensaje, formulario y filtros |
| `test/postulaciones.test.jsx`, `test/panel.test.jsx`, `test/control.test.jsx`, `test/admin-usuarios.test.jsx` | Ampliación |

### Reglas de interfaz

- El formulario valida los 4 enteros 1–5 y muestra el error de API sin borrar lo escrito.
- El botón se deshabilita mientras envía; un doble clic no crea duplicados.
- Los filtros de calificación y horas van al backend; texto y estado siguen en cliente.
- El becario solo ve su promedio agregado y el mensaje; nunca evaluaciones individuales ni el evaluador.
- Estrellas con texto alternativo: `"4.3 de 5 estrellas"`.

### Criterios de aceptación

- Panel del becario: 9 trabajos → `faltan realizar trabajos`; 10 → estrellas y valor numérico.
- Postulaciones muestra la calificación de cada estudiante y filtra por mínimo y horas pendientes.
- El formulario crea la evaluación, actualiza la fila y no permite una segunda.
- Navegable con teclado y anunciado correctamente por lector de pantalla.

### Verificación

`npm run lint`, `npm test`, `npm run build`; flujo manual con backend local.

### Propiedad

Integrante **C**. Archivos de la tabla anterior, incluidos los tests del frontend.

---

## 7. Reparto y dependencias (3 integrantes)

| Integrante | Módulo | Archivos exclusivos |
|---|---|---|
| **A** | `contextos` | `migrations/0004_contextos.sql`, `src/lib/validation.js`, `src/services/users.js`, `test/api.test.js` |
| **B** | `evaluaciones` | `migrations/0005_evaluaciones.sql`, `src/lib/jobs-validation.js`, `src/services/jobs.js`, `src/services/control.js`, `src/routes/jobs.js`, `src/routes/control.js`, `openapi.yaml`, `test/evaluaciones.test.js`, `test/jobs.test.js`, `test/control.test.js` |
| **C** | `evaluaciones-ui` | `src/components/ui.jsx`, `src/api/endpoints.js`, `src/lib/contextos.js`, `src/pages/Control.jsx`, `src/pages/Postulaciones.jsx`, `src/pages/Panel.jsx`, `src/pages/AdminUsuarios.jsx`, `src/pages/Trabajos.jsx`, `test/*.test.jsx` |

Dependencias y coordinación:

- **B es el único propietario de `openapi.yaml`**; aplica el cambio de enum de `contextos` y el contrato de evaluaciones. A y C no lo editan.
- **A es el único propietario de `0004`; B de `0005`.** Ninguno edita la migración del otro.
- A y B no comparten archivos y pueden avanzar en paralelo. C consume el contrato y puede usar mocks hasta que `evaluaciones` pase sus pruebas.
- Antes de integrar: revisión cruzada y suites completas en ambos repos.
- Sin push, merge ni despliegue automáticos.

---

## 8. Fuera del alcance del MVP v2

- Editar o eliminar evaluaciones, o apelarlas.
- Calificación en la supervisión del administrador (solo postulaciones y panel del becario).
- Notificaciones, comentarios o reputación pública.
- Cambios al cierre, a la idempotencia o al cálculo de horas.
- Renombrar tablas, roles o columnas internas.
- Nuevas dependencias o migración a TypeScript/ORM.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Dos personas editan `openapi.yaml` | B es el único propietario; A y C piden cambios |
| El filtro por calificación requiere SQL, no cliente | `WITH base` + `LEFT JOIN LATERAL` antes de paginar; prueba con 3 estudiantes y 2 páginas |
| Migración de contextos con datos viejos | Conversión explícita en `0004` y prueba sobre copia local |
| Ambigüedad entre 10 trabajos y 10 evaluaciones | Decisión 2 y 7: el umbral cuenta trabajos cerrados con asistencia; el promedio usa las evaluaciones disponibles |
| Estrellas fraccionales poco accesibles | `aria-label` numérico y texto alternativo |
| Redondeo inconsistente | `numeric(3,2)` generado en la base; prueba 4,5,4,3 → 4.00 |

---

## 10. Criterio de terminación

El MVP v2 termina cuando, contra PostgreSQL local:

1. Se crean cuentas de plantel administrativo y jefe de carrera con área/carrera libre.
2. Un trabajo cerrado con asistencia permite evaluar los 4 criterios una sola vez.
3. El becario ve estrellas con 10 o más trabajos y `faltan realizar trabajos` con menos.
4. Postulaciones muestra la calificación y filtra por calificación mínima y horas pendientes.
5. `npm run check`, `npm test`, `npm run db:migrate`, `npm run lint` y `npm run build` pasan en ambos repos.
