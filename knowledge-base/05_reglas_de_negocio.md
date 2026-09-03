# Reglas de Negocio

Cada regla tiene un código único `RN-WS-{NN}` (tal como está codificado en `docs_wasa_sdd/HISTORIAS_DE_USUARIO.txt`) para trazabilidad.

## Dominio: Formulario de escaneo (RN-WS-01 a 05)

- **RN-WS-01**: El formulario de escaneo solo puede enviarse si el checkbox de declaración ética está marcado. El botón "Escanear" permanece deshabilitado hasta que se cumpla. — HU-02-01, HU-02-05
- **RN-WS-02**: `target_url` debe ser una URL válida con esquema `http://` o `https://`. Se rechaza cualquier valor que no cumpla el formato. — HU-02-02, HU-03-02
- **RN-WS-03**: `phpsessid` es obligatorio. No se acepta cadena vacía ni solo espacios en blanco. — HU-02-03, HU-03-02
- **RN-WS-04**: `sqlmap_level` debe ser entero entre 1 y 5. Valor por defecto: 1. — HU-02-04, HU-03-02
- **RN-WS-05**: `sqlmap_risk` debe ser entero entre 1 y 3. Valor por defecto: 1. — HU-02-04, HU-03-02

## Dominio: FastAPI Bridge / API (RN-WS-06, 07, 09, 11, 16)

- **RN-WS-06**: El Bridge aplica rate limiting de 10 solicitudes por IP por ventana de 60 minutos sobre `/scan/start`. Excedentes reciben 429 Too Many Requests. — HU-03-03
- **RN-WS-07**: El Bridge NO ejecuta herramientas de seguridad directamente. Solo valida y delega al webhook de n8n (fire-and-forward). — HU-03-03
- **RN-WS-09**: Los errores del Bridge deben seguir el formato RFC 7807 (Problem Details for HTTP APIs). — HU-03-04
- **RN-WS-11**: `POST /api/v1/scan/start` requiere un JWT válido en el header `Authorization` (Bearer token). Sin él: 401 Unauthorized. — HU-06-04, HU-03-02
- **RN-WS-16** *(nueva — CHANGE-23)*: El reporte de vulnerabilidades que emite n8n al finalizar un escaneo se envía exclusivamente al email del usuario autenticado que lo inició, extraído del JWT (`get_current_user`). `ScanRequest` NO expone ningún campo de email — el cliente nunca puede elegir ni sobrescribir el destinatario del reporte. — HU-04-03

## Dominio: Autenticación (RN-WS-12, 13, 14, 15)

- **RN-WS-12**: Las contraseñas se almacenan exclusivamente como hash bcrypt. El texto plano nunca se persiste ni se retorna en ninguna respuesta. — HU-06-02
- **RN-WS-13**: El email del usuario debe ser único en la base de datos (tabla `users` de `db_fuzzing`). Un registro con email duplicado retorna 409 Conflict. — HU-06-02
- **RN-WS-14**: Los JWT tienen expiración configurable (default: 24h). Al expirar, el frontend limpia el authStore y muestra nuevamente el muro de autenticación. — HU-06-03
- **RN-WS-15**: La contraseña mínima es 8 caracteres. Validación tanto en frontend (Zod) como en backend (Pydantic v2). — HU-06-02

## Dominio: Frontend / Navegación (RN-WS-08, 10)

- **RN-WS-08** *(enmendada por `frontend-info-and-pending-screens`, 2026-08-31)*: Tras recibir 202 Accepted del Bridge, el frontend **ya no** redirige al Dashboard. El formulario es reemplazado, dentro de la misma página (`/scan`), por una pantalla de espera persistente que informa que el escaneo está en curso, que tarda aproximadamente diez minutos y que el reporte llega por correo electrónico a la casilla de la cuenta con la que el usuario inició sesión (RN-WS-16, HU-04-03 de CHANGE-23). El Dashboard sigue siendo alcanzable desde el `Navbar`, pero ninguna respuesta del Bridge —aceptación incluida— dispara una navegación automática. *(Redacción original, ya no vigente: "Tras recibir 202 Accepted del Bridge, el frontend redirige automáticamente al Dashboard existente (React/Node.js)." Dejaba de describir el sistema real desde que CHANGE-23 hizo que el reporte llegue por email: expulsar al usuario a un Dashboard donde, en los primeros minutos, no hay nada que ver, resolvía un problema que ya no existía.)* — HU-05-01
- **RN-WS-10**: El formulario de escaneo está OCULTO para usuarios no autenticados. En su lugar se muestra un muro de autenticación con botones "Iniciar Sesión" y "Crear Cuenta". — HU-06-01, HU-02-01

## Dominio: Excepciones globales

- Todos los errores 400/401/409/422/429/502/500 pasan por el handler global RFC 7807 (`exceptions/handlers.py`), sin excepción por dominio (Auth y Scan comparten el mismo formato de error).
- El mensaje 401 de login NO distingue si falló el email o la contraseña (evita enumeración de usuarios) — ver HU-03-02.
