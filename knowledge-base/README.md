# WASA Landing Page & FastAPI Bridge — Base de Conocimiento

Base de conocimiento generada en modo *ingest* a partir de los documentos SDD ya existentes en `docs_wasa_sdd/` (`DESCRIPCION.txt`, `INTEGRADOR.txt`, `HISTORIAS_DE_USUARIO.txt`, `CHANGES.md`, `AGENTS.md`) y del contexto de infraestructura en `docs_sdd_referencia/` (tesis original de fuzzing: n8n, Redis, SQLMap Worker, ZAP, Nuclei, PostgreSQL).

## Índice de Archivos

| Archivo | Contenido |
|---------|-----------|
| [01_vision_y_objetivos.md](01_vision_y_objetivos.md) | Propósito del SaaS WASA, objetivos por actor, alcance v1.2, fuera de alcance, métricas de éxito |
| [02_descripcion_general.md](02_descripcion_general.md) | Stack tecnológico, arquitectura general (diagrama), integraciones externas, resumen de API REST |
| [03_actores_y_roles.md](03_actores_y_roles.md) | Actores del sistema, matriz RBAC (autenticado vs. anónimo), rutas públicas |
| [04_modelo_de_datos.md](04_modelo_de_datos.md) | ERD, entidades `users` (nueva), `scans`/`vulnerabilities` (existentes) — todas en PostgreSQL `db_fuzzing` |
| [05_reglas_de_negocio.md](05_reglas_de_negocio.md) | 16 reglas RN-WS-01..16 por dominio (scan form, API, auth, frontend) |
| [06_funcionalidades.md](06_funcionalidades.md) | 6 épicas, 27 historias de usuario (HU-EE-NN, incl. HU-04-03 de CHANGE-23) con criterios de aceptación |
| [07_flujos_principales.md](07_flujos_principales.md) | Flujos end-to-end: registro, login, escaneo (con diagramas de secuencia) |
| [08_arquitectura_propuesta.md](08_arquitectura_propuesta.md) | Patrones (Repository/UoW/JWT/RFC7807/FSD), estructura de directorios, seguridad, variables de entorno |
| [09_decisiones_y_supuestos.md](09_decisiones_y_supuestos.md) | 4 decisiones documentadas (incl. reuso de PostgreSQL `db_fuzzing`) + 3 supuestos inferidos |
| [10_preguntas_abiertas.md](10_preguntas_abiertas.md) | Preguntas abiertas priorizadas (credenciales reales de infra, alcance de auth, multi-tenancy) |

## Quick Start para Desarrolladores

1. Entender el dominio → [01](01_vision_y_objetivos.md), [03](03_actores_y_roles.md)
2. Entender los datos → [04](04_modelo_de_datos.md)
3. Entender las reglas → [05](05_reglas_de_negocio.md)
4. Entender la arquitectura → [02](02_descripcion_general.md), [08](08_arquitectura_propuesta.md)
5. Implementar → [07](07_flujos_principales.md), [06](06_funcionalidades.md)
6. Antes de codificar → [10](10_preguntas_abiertas.md)

## Resumen Ejecutivo

WASA es una plataforma SaaS de seguridad automatizada (ZAP, Nuclei, ffuf, SQLMap). Este proyecto agrega la capa pública (Landing Page React + FastAPI Bridge) con autenticación JWT: solo usuarios registrados pueden lanzar escaneos, que se delegan a un Webhook Trigger de n8n. Los usuarios se persisten en una tabla nueva (`users`) dentro de la misma instancia PostgreSQL `db_fuzzing` que ya usa el sistema WASA para `scans`/`vulnerabilities` — no se introduce un motor de base de datos separado.
