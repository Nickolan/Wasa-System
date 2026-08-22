# Preguntas Abiertas

## Inconsistencias detectadas

_Ninguna inconsistencia activa._ La única inconsistencia relevante (SQLite local vs. PostgreSQL compartida para la tabla `users`) ya fue detectada y resuelta antes de esta KB: los 5 documentos fuente (`DESCRIPCION.txt`, `INTEGRADOR.txt`, `AGENTS.md`, `HISTORIAS_DE_USUARIO.txt`, `CHANGES.md`) fueron actualizados para reflejar PostgreSQL `db_fuzzing` como única base de datos (ver DD-02 en `09_decisiones_y_supuestos.md`).

## Preguntas abiertas (priorizadas)

| Prioridad | Pregunta | Bloquea | Decisor |
|-----------|----------|---------|---------|
| Alta | ¿Cuáles son los datos reales de conexión (host, puerto, usuario, password) de la instancia PostgreSQL `db_fuzzing` ya desplegada? | CHANGE-00c, CHANGE-01 | Equipo técnico / infra |
| Alta | ¿Cuáles son los valores reales de `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TOKEN` de la instancia n8n existente? | CHANGE-00c, CHANGE-21 | Equipo técnico / infra |
| Media | ¿Se requiere recuperación de contraseña o verificación de email para el lanzamiento inicial, o queda fuera del MVP? (ver SU-03) | Sprint 2 (Auth Backend) | Product Owner |
| Media | ¿Está en el roadmap algún esquema de multi-tenancy (organizaciones, roles admin/evaluador)? (ver SU-02) | Diseño de `users` a futuro | Product Owner |
| Baja | ¿El usuario permanece deslogueado permanentemente al expirar el JWT (24h), o se planea un refresh token en una iteración futura? | Iteración post-MVP | Tech Lead |

## Notas de discovery (para `state.kb.discovery`, campo `scale`)

`scale` se infiere como **"public_multi_user"** (SaaS de autoservicio, cualquier persona puede crear cuenta) con **confianza media** — no hay mención explícita de límites de usuarios concurrentes ni de aislamiento multi-tenant en los documentos fuente. Si en el futuro se confirma un modelo multi-tenant (organizaciones, equipos), este valor debería revisarse junto con el modelo de datos de `users` (agregar `tenant_id` o similar).
