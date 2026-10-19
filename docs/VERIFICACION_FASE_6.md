# Verificación de fase 6 — calidad, CI/CD y operación

**Estado:** controles locales implementados y verificados; preparación productiva pendiente. No se añadieron migraciones ni dependencias.

## Prerrequisitos revisados y corregidos

- Los dos repositorios tienen lockfiles y dependencias instaladas. Backend dispone de PostgreSQL 17/18 local y helpers que solo permiten bases de prueba locales nombradas explícitamente.
- No había credenciales seguras para reutilizar el PostgreSQL de la máquina. Levanté un clúster temporal dentro del workspace, ejecuté la suite y lo detuve/eliminé al terminar.
- La CI backend ya tenía PostgreSQL efímero, migraciones, lint OpenAPI, suite API y comprobación de `/ready`; añadí cache npm, verificación de migraciones idempotentes y ejecución para `sergio`.
- La CI frontend y los workflows Firebase ya existían. Añadí las pruebas/lint/build antes de los deploys de preview/live y activé CI en `sergio`.
- No están disponibles localmente un proyecto Supabase dedicado, dominios de despliegue ni credenciales de Firebase/GitHub para verificar producción. No accedí a servicios remotos.

## Implementado

- El plan prioriza cobertura de autenticación, revocación de sesión, roles/propiedad, validación, concurrencia de cupos y cierres/idempotencia. La suite existente cubre esos casos y fase 5.
- Workflow backend: `npm ci`, sintaxis, migraciones, migraciones repetidas para idempotencia, Redocly, pruebas con PostgreSQL efímero y readiness.
- Documentación de instalación, variables, pruebas, migraciones, respaldo/recuperación y restricciones operativas actualizada.

## Verificaciones ejecutadas

- Backend: recorrido local de CI completo: migraciones desde cero y repetidas, `npm test` **47/47** sobre PostgreSQL descartable y `/ready` 200; `npm run check` correcto.
- Redocly CLI 1.34.2: OpenAPI válido; un aviso no bloqueante `info-license-strict` sobre la licencia descriptiva.
- Frontend: `npm run lint`, **33/33** pruebas y `npm run build` correctos.
- `git diff --check` correcto en ambos repositorios.

## Límites pendientes

- No se observó un resultado de GitHub Actions: la rama solo tiene commit local y no se publicó.
- No se aprovisionó Supabase, no se corrieron migraciones remotas y no se desplegó Firebase.
- Las cookies entre dominios requieren URL pública, CORS y navegador real. Esa prueba queda pendiente hasta disponer de dominios y secretos.
- No se hizo recorrido manual de navegador. La expiración de sesión y el foco modal tienen pruebas automatizadas de frontend.
