# Funcionalidades

Organizadas por **épica** y luego por **historia de usuario**. El proyecto fuente usa el formato `HU-{EPIC}-{NN}` (no `US-NNN`); se conserva esa numeración por trazabilidad con `docs_wasa_sdd/HISTORIAS_DE_USUARIO.txt`.

## Épica 1: Landing Page — Comunicación y Descubrimiento

Sección informativa pública, accesible por cualquier visitante.

### HU-01-01 — Ver sección Hero
**Como** Usuario Anónimo **quiero** ver hero con nombre/tagline/CTA **para** entender de inmediato de qué trata WASA.
**CA**: CTA "Comenzar" abre login si no autenticado / hace scroll a `#scan-form` si sí; responsive; ilustración de seguridad web.

### HU-01-02 — Ver herramientas utilizadas por WASA
**Como** Usuario Anónimo **quiero** ver qué detecta cada herramienta (ZAP, Nuclei, ffuf, SQLMap) **para** evaluar si cubre mis necesidades.
**CA**: ≥4 tarjetas (nombre + ícono + descripción); responsive.

### HU-01-03 — Entender el flujo paso a paso
**Como** Usuario Anónimo **quiero** ver el proceso en pasos **para** entender qué pasa tras "Escanear".
**CA**: ≥4 pasos (crear cuenta → configurar → enviar → ver resultados); abstrae n8n completamente.

### HU-01-04 — Ver aviso ético y legal
**Como** Usuario Anónimo **quiero** ver aviso de uso autorizado **para** que el marco ético quede explícito antes de registrarme.
**CA**: mención explícita a "autorización del propietario"; no puede ocultarse.

## Épica 2: Formulario de Escaneo — Configuración (solo autenticados)

Solo visible con JWT válido en authStore.

### HU-02-01 — Ver el formulario de escaneo (autenticado)
**Reglas**: RN-WS-10. **CA**: visible solo con JWT válido; campos target_url, phpsessid, sqlmap_level, sqlmap_risk, checkbox ético; defaults level=1, risk=1.

### HU-02-02 — Validar target_url
**CA**: mensaje si vacío o sin esquema http/https; validación onChange + blur; borde rojo/verde.

### HU-02-03 — Validar phpsessid
**CA**: mensaje "PHPSESSID requerido" si vacío; no acepta solo espacios.

### HU-02-04 — Configurar parámetros avanzados SQLMap
**CA**: sqlmap_level 1-5 (default 1), sqlmap_risk 1-3 (default 1), tooltips, clamping a rango.

### HU-02-05 — Aceptar declaración ética
**Reglas**: RN-WS-01. **CA**: checkbox de autorización; botón "Escanear" deshabilitado sin marcarlo.

## Épica 3: FastAPI Bridge — Auth + Validación + Forwarding

### HU-03-01 — Registrar un nuevo usuario
**Reglas**: RN-WS-12, 13, 15. **CA**: `POST /auth/register` crea usuario en `users` (PostgreSQL `db_fuzzing`), 201 + TokenResponse; 409 si email duplicado; 400 si email/password inválidos; bcrypt rounds=12; texto plano nunca expuesto.

### HU-03-02 — Autenticar usuario existente
**Reglas**: RN-WS-12, 14. **CA**: `POST /auth/login` 200 + TokenResponse si credenciales OK; 401 genérico (no distingue campo) si no; JWT con `sub`(email) + `exp`.

### HU-03-03 — Proteger /scan/start con JWT Bearer
**Reglas**: RN-WS-11, 14. **CA**: 401 sin header / JWT malformado / JWT expirado; `get_current_user` extrae email del payload.

### HU-03-04 — Validar payload del escaneo
**Reglas**: RN-WS-02 a 05. **CA**: 400/422 con detalle RFC 7807 por cada campo inválido.

### HU-03-05 — Delegar escaneo a n8n via webhook
**Reglas**: RN-WS-07. **CA**: payload incluye scan_id (UUID); 202 si n8n responde 200; 502 si n8n falla/no responde.

### HU-03-06 — Aplicar rate limiting por IP en /scan/start
**Reglas**: RN-WS-06. **CA**: 10 req/60min por IP; solicitud 11 → 429 + header `Retry-After`; configurable por env vars.

### HU-03-07 — Retornar errores en formato RFC 7807
**Reglas**: RN-WS-09. **CA**: 400/401/409/422/429/502/500 cubiertos con `type/title/status/detail/instance`.

## Épica 4: Integración n8n — Webhook Trigger

### HU-04-01 — Configurar Webhook Trigger en n8n
**CA**: nodo Webhook Trigger activo (POST/JSON); Schedule Trigger anterior desactivado; responde 200 OK inmediato (background execution).

### HU-04-02 — Inyectar variables del webhook en el workflow
**CA**: `$json.target_url`/`phpsessid` disponibles en ZAP/Nuclei/ffuf; `$json.sqlmap_level`/`sqlmap_risk` en LPUSH Redis; `$json.scan_id` en INSERT de `scans`.

### HU-04-03 — Enviar el reporte al email del usuario que inició el escaneo *(nueva — CHANGE-23)*
**Como** Usuario Evaluador autenticado **quiero** recibir el reporte de mi escaneo en mi propio email **para** no depender de revisar el Dashboard para enterarme de los hallazgos.
**Reglas**: RN-WS-16. **CA**: el Bridge agrega el email del usuario autenticado (JWT, no un campo del formulario) al `N8nPayload` que reenvía a n8n; el nodo `Send email` del workflow usa ese email como `toEmail` en vez del valor fijo hardcodeado; un usuario que solo envía `target_url`/`phpsessid`/`sqlmap_level`/`sqlmap_risk` (sin campo de email posible) sigue recibiendo el reporte en la casilla con la que se registró.

## Épica 5: Redirección — Navegación al Dashboard

### HU-05-01 — Redirección automática al Dashboard
**Reglas**: RN-WS-08. **CA**: redirige a `VITE_DASHBOARD_URL` tras 202; mensaje de éxito ~2s; spinner si tarda >10s.

### HU-05-02 — Ver estado de carga durante el envío
**CA**: botón a estado de carga y deshabilitado; feedback visual en éxito/error.

### HU-05-03 — Ver errores del servidor en el formulario
**CA**: mensajes específicos por código (401 sesión expirada, 400/422 campo inválido, 429 límite alcanzado, 502 no disponible, error de red).

## Épica 6: Autenticación — Registro y Login

### HU-06-01 — Ver muro de autenticación
**Reglas**: RN-WS-10. **CA**: muro con "Iniciar Sesión"/"Crear Cuenta" si `!isAuthenticated`; hidratación automática si hay JWT válido en localStorage.

### HU-06-02 — Registrarse como nuevo usuario
**Reglas**: RN-WS-12, 13, 15. **CA**: modal con email+password; Zod client-side; 409 → "Este email ya está registrado."; spinner en submit.

### HU-06-03 — Iniciar sesión con cuenta existente
**Reglas**: RN-WS-14. **CA**: modal login; 401 → "Credenciales incorrectas."; spinner en submit.

### HU-06-04 — Persistir sesión entre recargas
**Reglas**: RN-WS-14. **CA**: JWT en localStorage; `hydrate()` valida expiración al cargar; interceptor Axios adjunta el JWT automáticamente.

### HU-06-05 — Cerrar sesión
**CA**: botón "Cerrar sesión" visible si autenticado; limpieza local únicamente (sin request al backend); vuelve a mostrar el muro.
