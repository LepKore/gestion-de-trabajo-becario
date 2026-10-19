# Verificación local de la fase 2 — Auth y Usuarios

Fecha: 19 de octubre de 2026. Se usa la numeración del [plan de trabajo](PLAN_DE_TRABAJO_MIBECA.md#fase-2--auth-y-usuarios). Los repositorios frontend y backend se revisaron como carpetas hermanas, con el backend en `http://127.0.0.1:3000` y el frontend de Vite con su proxy `/api`. Esta evidencia local no acredita ejecuciones de GitHub Actions, despliegues ni publicación en Firebase.

## Alcance implementado

- Contrato canónico `openapi.yaml` (OpenAPI 3.1) con los grupos Auth y Usuarios.
- Migración inicial del dominio `migrations/0001_init.sql`: `usuarios`, `estudiantes`, `encargados`, `sesiones` y `auditoria`.
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`.
- `GET /users`, `POST /users`, `GET /users/{id}`, `PATCH /users/{id}`, `POST /users/{id}/deactivate`, `/reactivate`, `/reset-password`, todas restringidas a ADMIN.
- Frontend: login, cambio obligatorio de contraseña, recuperación de sesión con `/auth/me`, navegación y rutas por rol, y administración de usuarios con la contraseña temporal mostrada una vez.

## Comprobaciones automáticas

| Comprobación | Resultado local |
|---|---|
| `npm run check` | Sintaxis correcta en 20 archivos. |
| `npm test` | 25 de 25 pruebas superadas en unos 1,2 s. |
| `npx @redocly/cli@latest lint openapi.yaml` | Descripción válida; un aviso `info-license-strict` porque el proyecto no tiene archivo `LICENSE`. Sale con código 0. |
| `npm run lint` (frontend) | Sin incidencias. |
| `npm run build` (frontend) | Compilación correcta. |

## Pruebas de API por criterio del plan

| Criterio | Comprobación |
|---|---|
| Login válido e inválido | Login correcto devuelve cookie `HttpOnly`; correo o contraseña incorrectos devuelven 401 con el mismo mensaje; cuerpo inválido devuelve 400. |
| Contraseña obligatoria | `GET /auth/me` responde 401 sin cookie y con cookie inválida. |
| Rutas protegidas | Con `requiereCambioPassword` pendiente, las rutas de negocio responden 403; tras el cambio, la misma operación responde correctamente. |
| Cambio de contraseña | Rechaza cabecera CSRF ausente, contraseña actual incorrecta, confirmación distinta, contraseña corta y contraseña repetida. Al cambiar se revocan todas las sesiones y se renueva la cookie. |
| Revocación | Logout, desactivación y restablecimiento revocan las sesiones; reactivar una cuenta no revive sesiones viejas. |
| Último administrador protegido | Desactivar al último ADMIN activo responde 409 `ultimo_admin_activo`. |
| Roles | Becario y encargado reciben 403 en las rutas de administración de usuarios. |
| Código con ceros iniciales | El código `00731` se conserva como texto de cinco dígitos. |
| Duplicados | Correo repetido y código de estudiante repetido devuelven 409. |
| Semestre y meta inválidos | Semestre fuera de 1..12 y meta no positiva o no múltiplo de seis devuelven 400. |
| Perfil por rol | ADMIN exige únicamente nombre, correo y rol; BECARIO exige el perfil de estudiante; ENCARGADO, el de encargado. |
| Rol fijo | `PATCH /users/{id}` con `rol` devuelve 400. |
| Baja lógica | La fila se conserva con `activo = false` y el historial permanece. |
| CORS | Origen permitido con credenciales; origen no permitido rechazado. |

## Comprobación manual en navegador

Con el backend y el frontend de desarrollo en marcha y el proxy `/api` activo:

1. El administrador inicia sesión y es redirigido a `/change-password` porque su cuenta tiene el cambio pendiente.
2. Cambia la contraseña y entra al panel de administración.
3. Crea un becario con código `00731` (se conservan los ceros iniciales) y un encargado; en ambos casos la contraseña temporal aparece una sola vez en un diálogo y se entrega en persona.
4. Reinicia la contraseña de una cuenta: la nueva temporal se muestra una vez en la fila.
5. Cierra sesión, inicia sesión con la temporal de Ana y repite el cambio obligatorio.
6. El becario entra a su panel con su navegación propia; `/admin/usuarios` lo devuelve a su panel.
7. Cerrar sesión invalida la sesión y el siguiente intento de `/auth/me` devuelve 401.

Defectos encontrados y corregidos durante esta comprobación: uso de `window.confirm` (bloquea el navegador) sustituido por un diálogo propio; diálogo fuera del viewport; diálogo renderizado dentro de `<tr>` (HTML inválido) resuelto con `createPortal`; lectura errónea de la respuesta de `POST /users`; pérdida de la contraseña temporal al recargar la tabla; mensaje falso de «sesión revocada» en el 401 inicial de `/auth/me`; y enlaces de navegación subrayados. La identidad visual se comprobó por captura en la pantalla de becario.

## Administrador inicial

`npm run db:bootstrap-admin` creó el primer administrador (`admin@mibeca.local`) en la base local. Es idempotente: la segunda ejecución informó que ya existía un administrador activo. No hay credenciales predeterminadas en Git ni creación automática al migrar o arrancar el servidor. Queda modificable por SQL.

## Límites de esta verificación

- No se ejecutó GitHub Actions ni ningún despliegue; los pasos de CI son los mismos comandos verificados localmente.
- No se probó el despliegue real de Supabase ni el de Firebase, ni el cruce de dominios entre frontend y backend en producción.
- El límite de intentos de login y el vencimiento de sesión se configuran por variables de entorno y se desactivan en pruebas; no se midió su comportamiento bajo carga real.
- Las rutas de trabajos, postulaciones y control de las fases 3 y 4 no existen; sus secciones en la interfaz muestran estados vacíos que lo indican.