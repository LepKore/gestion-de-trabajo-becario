# Contexto del proyecto

> Última verificación: 2026-10-19

## 1. Propósito del proyecto
API Node.js para la gestión de trabajo becario de MiBeca.
Audiencia / uso: desarrollo local y CI del backend.

## 2. Stack tecnológico y arquitectura
Frontend: N/A; vive en el repositorio hermano.
Backend: Node.js, Express y PostgreSQL.
Patrones clave: API con `src/app.js`, servidor en `src/server.js` y migraciones versionadas.

## 3. Estructura del proyecto (mapeo)
`src/`: aplicación y acceso a datos.
`scripts/`: comprobaciones y operaciones de base de datos.
`migrations/`: SQL versionado.
`test/`: pruebas de API.
`openapi.yaml`: contrato técnico.
Nota para IA: no modificar credenciales ni ejecutar despliegues o migraciones remotas por iniciativa propia.

## 4. Comandos críticos
Inicialización: `npm ci`.
Desarrollo: `npm run dev`.
Testing: `npm test`.
Lint / typecheck: `npm run check`.
Deploy: N/A; requiere confirmación humana.

## 5. Reglas y convenciones estrictas
Estilo de código: JavaScript ESM y scripts existentes del proyecto.
Librerías permitidas / prohibidas: usar dependencias ya declaradas salvo autorización.
Manejo de errores: no exponer secretos ni trazas en respuestas.

## 6. Estado actual y registro de cambios
Completado: autenticación, usuarios, contrato OpenAPI y CI local con PostgreSQL efímero.
En progreso: fases posteriores del MVP.
Problemas conocidos: rotar la contraseña de Supabase expuesta en una prueba antes de usarla.
