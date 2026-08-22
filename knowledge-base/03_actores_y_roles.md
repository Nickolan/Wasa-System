# Actores y Roles

## Actores del sistema

| Actor | Descripción | Cómo interactúa |
|---|---|---|
| Usuario Anónimo (UA) | Visitante no autenticado | Ve Hero, Features, HowItWorks, Footer, aviso ético. NO puede ver ni enviar el formulario de escaneo; ve un muro de login/registro. |
| Usuario Evaluador (UE) | Profesional de seguridad o estudiante con cuenta registrada y sesión activa (JWT válido) | Configura y lanza escaneos (target_url, phpsessid, sqlmap_level, sqlmap_risk); declara autorización ética. |
| FastAPI Bridge (FB) | Microservicio Python — actor interno/sistema | Gestiona usuarios (tabla `users` en PostgreSQL `db_fuzzing`), emite y valida JWTs, aplica rate limiting, delega el escaneo al webhook de n8n. |
| n8n Orchestrator (SW) | Recibe el webhook — actor interno/sistema | Inyecta variables al workflow y ejecuta ZAP, Nuclei, ffuf, SQLMap en secuencia. |
| Dashboard (React/Node.js, existente) | Destino final tras el inicio exitoso del escaneo | Muestra KPIs, reportes y rankings. Sistema ya validado en la tesis, no se reconstruye. |

## RBAC — Matriz de permisos

No hay roles diferenciados dentro de "usuario registrado" (no hay admin/evaluador distintos a nivel de sistema en este alcance) — es un modelo binario: **autenticado vs. no autenticado**.

| Rol | Recurso | Permisos |
|---|---|---|
| Anónimo | Contenido informativo de la Landing (Hero, Features, HowItWorks, aviso ético, Footer) | Lectura |
| Anónimo | `/api/v1/auth/register`, `/api/v1/auth/login` | Ejecutar (crear cuenta / obtener JWT) |
| Anónimo | Formulario de escaneo (`ScanFormWidget` con campos) | Sin acceso — solo ve el muro de auth |
| Anónimo | `POST /api/v1/scan/start` | Denegado (401) |
| Autenticado (JWT válido) | Formulario de escaneo | Lectura + envío |
| Autenticado (JWT válido) | `POST /api/v1/scan/start` | Ejecutar (sujeto a rate limit 10/IP/60min) |
| Autenticado (JWT válido) | Su propia sesión (authStore) | Logout (limpieza local, sin request al backend) |

## Rutas públicas

- Landing Page completa (Hero, Features, HowItWorks, aviso ético, Footer) — sin autenticación.
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /health`

Todas las demás rutas de negocio (`/api/v1/scan/start`) requieren `Authorization: Bearer <jwt>`.
