# Visión y Objetivos

## Propósito del sistema

WASA (Web Application Security Assessment) es una plataforma SaaS de seguridad automatizada que orquesta ZAP, Nuclei, ffuf y SQLMap para detectar vulnerabilidades en aplicaciones web objetivo, consolidando los hallazgos en un Dashboard unificado. Este proyecto (Landing Page + FastAPI Bridge) es la **capa de presentación pública** que expone ese sistema al mundo exterior: reemplaza el disparo manual por Schedule Trigger en n8n (usado en la tesis original) por un flujo web con autenticación, donde solo usuarios registrados pueden lanzar escaneos.

## Objetivos por actor

| Actor | Objetivo principal | Objetivos secundarios |
|---|---|---|
| Usuario Anónimo | Entender qué es WASA y qué detecta antes de registrarse | Ver aviso ético; decidir si crear cuenta |
| Usuario Evaluador | Lanzar un escaneo de seguridad sobre un objetivo autorizado | Configurar parámetros SQLMap; ver progreso en el Dashboard |
| FastAPI Bridge | Autenticar usuarios y validar/delegar escaneos de forma segura | Aplicar rate limiting; no ejecutar herramientas directamente |
| Negocio (dueño del SaaS) | Proteger el servicio de uso no autorizado y abuso de recursos | Bajar la barrera de entrada de "operar n8n" a "crear cuenta y completar un form" |

## Alcance v1.2

- Landing Page React (FSD): secciones públicas (Hero, Features, HowItWorks, aviso ético, Footer) + muro de autenticación + formulario de escaneo protegido.
- FastAPI Bridge: autenticación JWT (register/login) con persistencia en la tabla nueva `users` dentro de la **misma instancia PostgreSQL `db_fuzzing`** que ya usa el sistema WASA (no se crea un motor de base de datos separado).
- Validación Pydantic v2, rate limiting (10 req/IP/60min sobre `/scan/start`), forwarding del escaneo al Webhook Trigger de n8n.
- authStore Zustand con persistencia en localStorage; modales de Login/Registro.
- Protección de `/scan/start` con JWT Bearer.
- Reemplazo del Schedule Trigger de n8n por un Webhook Trigger.

## Fuera de alcance

- Workflow interno de n8n (solo se agrega el nodo Webhook Trigger; el resto no se toca).
- Python SQLMap Worker, Redis/Memurai — no se modifican.
- Tablas existentes `scans` y `vulnerabilities` de PostgreSQL `db_fuzzing` — el Bridge no las lee ni las escribe, solo agrega `users`.
- Node.js/Express API del Dashboard y el React Dashboard (Panel General, Reporte, Endpoints) — ya validados en la tesis, no se reconstruyen.
- Recuperación de contraseña, verificación de email, refresh tokens — no mencionados en la documentación fuente (ver `10_preguntas_abiertas.md`).

## Métricas de éxito

- Un Usuario Evaluador puede registrarse, iniciar sesión y lanzar un escaneo sin tocar n8n directamente.
- El endpoint `/scan/start` responde en < 3 segundos (fire-and-forward) y respeta el rate limit de 10 req/IP/60min.
- Ningún dato de autenticación (password en texto plano, JWT_SECRET) se expone en logs ni respuestas.
- Cero regresiones sobre el sistema WASA existente (n8n, Worker, Redis, `scans`/`vulnerabilities`, Dashboard).
