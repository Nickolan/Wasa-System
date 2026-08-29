# Decisiones y Supuestos

## Decisiones documentadas

### DD-01 — Muro de autenticación JWT para el modelo SaaS
**Decisión**: el formulario de escaneo no es de acceso libre; requiere registro/login con JWT.
**Contexto**: en la tesis original cualquiera con acceso a n8n podía lanzar escaneos; al exponer un producto SaaS comercial hace falta proteger recursos y evitar abuso.
**Alternativas consideradas**: API key estática, OAuth de terceros, sin autenticación (solo rate limit por IP).
**Justificación**: JWT stateless es simple de implementar en FastAPI, no requiere infraestructura de sesión adicional, y permite expiración configurable.
**Trade-offs aceptados**: no hay refresh tokens ni recuperación de contraseña en este alcance (ver SU-03).

### DD-02 — Reutilizar PostgreSQL `db_fuzzing` en vez de una base SQLite separada
**Decisión**: la tabla `users` vive en la misma instancia PostgreSQL `db_fuzzing` que ya usa el sistema WASA para `scans`/`vulnerabilities`, en vez de un archivo SQLite local independiente.
**Contexto**: la primera versión del SDD (v1.1) proponía SQLite local (`users.db`) "independiente" de PostgreSQL. El usuario corrigió explícitamente esta decisión: no quiere dos motores de datos, quiere reusar la infraestructura ya desplegada.
**Alternativas consideradas**: SQLite local (descartada), un esquema/base PostgreSQL nueva separada (descartada por complejidad operativa innecesaria).
**Justificación**: un solo motor de base de datos que administrar, un solo `DB_URL`, sin sincronización entre dos DBs.
**Trade-offs aceptados**: el Bridge ahora depende de que la instancia PostgreSQL `db_fuzzing` esté accesible desde donde corra el Bridge (antes, SQLite era autocontenido en el filesystem local). El driver pasa de `aiosqlite` a `asyncpg`.

### DD-03 — Repository + Unit of Work en ambos dominios (Auth y Scan)
**Decisión**: tanto el dominio Auth como el dominio Scan siguen la misma arquitectura de 5 capas (Router → Service → UoW → Repository → Schema).
**Contexto**: mantener consistencia arquitectónica aunque Auth use SQLAlchemy y Scan use httpx.
**Justificación**: facilita testing (mockear UoW/Repository) y mantiene el Router libre de lógica de negocio en ambos dominios.

### DD-04 — Feature-Sliced Design (FSD) en el frontend
**Decisión**: la Landing Page organiza su código en capas `app → pages → widgets → features → entities → shared` con dependencia unidireccional.
**Justificación**: escalabilidad y separación clara entre lógica de negocio (features), tipos/validación (entities) y UI reutilizable (shared).

### DD-05 — El email del reporte se toma del JWT, nunca de un campo del cliente (CHANGE-23)
**Decisión**: el `N8nPayload` que el Bridge reenvía a n8n incluye el email del usuario autenticado que inició el escaneo (resuelto server-side por `get_current_user` a partir del JWT), y ese es el único email al que n8n puede enviar el reporte. `ScanRequest` no declara ni declarará un campo de email.
**Contexto**: pedido explícito del usuario (2026-08-28) — hoy el nodo `Send email` del workflow n8n (`Herramientas/Flujo_Fuzzing_N8N.json`) tiene el destinatario (`toEmail`) hardcodeado a una dirección fija, la misma para todos los escaneos, sin importar quién los dispare.
**Alternativas consideradas**: agregar un campo `email` (u otro tipo de destinatario) a `ScanRequest`, que el usuario complete o edite en el formulario de escaneo (descartada).
**Justificación**: el email ya viaja autenticado en el JWT (mismo patrón que `scan_id`, que tampoco lo aporta el cliente — ver `07_flujos_principales.md` §Flujo 3); confiar en un campo del formulario para el destino de un reporte con hallazgos de seguridad permitiría que un usuario autenticado exfiltrara ese reporte a una casilla ajena.
**Trade-offs aceptados**: el usuario no puede pedir que un escaneo puntual se reporte a una casilla distinta a la de su cuenta (p. ej. para compartirlo con un compañero) sin reenviarlo manualmente después de recibirlo.

## Supuestos inferidos

### SU-01 — El Webhook Trigger de n8n puede agregarse sin romper el workflow existente
**Supuesto**: reemplazar el Schedule Trigger por un Webhook Trigger es una operación de bajo riesgo sobre los 22 nodos existentes.
**Origen**: `docs_wasa_sdd/INTEGRADOR.txt` sección 8, `CHANGES.md` CHANGE-21.
**Riesgo si es falso**: podría requerir ajustes en nodos downstream que hoy asumen variables fijas del Schedule Trigger.
**Cómo validar**: probar el webhook manualmente con `curl` antes de desactivar el Schedule Trigger (ya cubierto por el criterio de aceptación de CHANGE-21).

### SU-02 — Escala: SaaS público multi-usuario, sin multi-tenancy
**Supuesto**: el sistema es "public_multi_user" (cualquier persona puede registrarse y usar su propia cuenta) pero SIN aislamiento por organización/tenant — todos los usuarios comparten la misma instancia y no hay roles diferenciados (ver `03_actores_y_roles.md`).
**Origen**: inferido de `DESCRIPCION.txt` (modelo SaaS, muro de autenticación) — no hay mención de organizaciones, equipos o roles admin/evaluador distintos.
**Riesgo si es falso**: si en el futuro se requiere aislar datos por organización, el modelo de `users` actual (tabla plana) necesitaría un campo de tenant.
**Cómo validar**: confirmar con el Product Owner si multi-tenancy está en el roadmap (no aparece en `CHANGES.md`).

### SU-03 — No hay recuperación de contraseña, verificación de email ni refresh tokens en este alcance
**Supuesto**: el MVP solo cubre registro + login + JWT de acceso único con expiración fija (24h). Al expirar, el usuario debe volver a loguearse manualmente.
**Origen**: ausencia de estas funcionalidades en `HISTORIAS_DE_USUARIO.txt` y `CHANGES.md`.
**Riesgo si es falso**: usuarios que pierden su sesión cada 24h sin forma de recuperar cuenta si olvidan la contraseña, lo cual puede generar fricción real en producción.
**Cómo validar**: confirmar con el Product Owner si esto es aceptable para el lanzamiento inicial (ver `10_preguntas_abiertas.md`).
