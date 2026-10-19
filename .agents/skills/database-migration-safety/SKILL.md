---
name: database-migration-safety
description: Revisa migraciones y operaciones de base de datos del backend MiBeca sin tocar destinos remotos por accidente. Usar al crear, modificar o ejecutar migraciones, semillas o scripts de bootstrap.
---

# Seguridad de migraciones

1. Lee `DATABASE_URL`, `MIGRATION_TARGET`, `MIGRATION_CONFIRM_HOST` y `DB_SSL_MODE` antes de ejecutar nada.
2. Revisa el SQL y confirma si el destino es local, Supabase u otro proveedor.
3. Para desarrollo usa únicamente la base local autorizada; no uses Render ni credenciales externas.
4. No ejecutes migraciones al arrancar la API ni durante pruebas que no lo soliciten.
5. Verifica `schema_migrations`, idempotencia, índices, restricciones y compatibilidad con datos existentes.
6. Nunca incluyas contraseñas, tokens o URLs con credenciales en commits, logs o documentación.
7. Ejecuta primero validaciones secas o `npm run check`; la migración remota requiere confirmación humana explícita.
