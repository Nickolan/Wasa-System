## Why

CHANGE-01 dejó la persistencia lista: la tabla `users` existe en `db_fuzzing` y hay una factory de `AsyncSession` para escribirla. Lo que falta es el otro extremo del flujo de Auth — **el contrato de datos que entra y sale por HTTP**. Hoy `fastapi_bridge/schemas/auth_schemas.py` es un docstring vacío, así que `UserRepository` (CHANGE-03), `AuthService` (CHANGE-04) y el router de auth (CHANGE-05) no tienen tipos que firmar: cada uno tendría que inventar su propia forma de "email + password" y de "token", y esas formas divergirían.

Este change define esos contratos una sola vez, en la capa que corresponde, antes de que exista un solo consumidor. Es además el punto donde se codifica RN-WS-15 (contraseña mínima de 8 caracteres) del lado del backend: la validación en Zod del frontend (CHANGE-14) es conveniencia de UX, no una garantía — la garantía vive acá.

## What Changes

- **Contratos de request de Auth**: `UserRegister` (email + password, con la política de longitud de RN-WS-15 **y un techo de 72 bytes UTF-8**) y `UserLogin` (email + password, sin política de longitud mínima más allá de no estar vacía — ver más abajo) reemplazan el placeholder de `schemas/auth_schemas.py`. El techo de 72 bytes no está en la KB y fue aprobado por el usuario: es el límite duro de bcrypt, que en la versión instalada lanza `ValueError` en vez de truncar, de modo que sin el tope una contraseña larga produciría un 500 en lugar de un 422 (ver D-2 en `design.md`). Ambos son modelos Pydantic v2 puros: sin imports de FastAPI, sin acceso a base de datos, sin lógica de negocio.
- **Contrato de respuesta de Auth**: `TokenResponse` (`access_token`, `token_type`, `expires_in`) — la forma que devuelven tanto `POST /auth/register` (201) como `POST /auth/login` (200), alineada con el formato de respuesta de token de OAuth 2.0 que el `authStore` de Zustand (CHANGE-13) ya espera consumir.
- **Contrato interno del JWT**: `TokenData` (`email: str | None`) — la representación tipada del payload decodificado que consumirá `get_current_user` en CHANGE-06. No es un schema de HTTP: nunca se serializa hacia el cliente.
- **Contrato de error RFC 7807**: `ErrorDetail` (`type`, `title`, `status`, `detail`, `instance`) en un módulo propio y nuevo, `schemas/error_schemas.py`, codificando RN-WS-09. Es el vocabulario compartido por Auth y Scan; los *handlers* que lo emiten llegan en CHANGE-07, pero la forma se fija acá para que ambos dominios la referencien desde el mismo lugar. **Desviación del roadmap aprobada por el usuario**: `CHANGES.md` ubicaba `ErrorDetail` en `scan_schemas.py`; al ser un contrato transversal, alojarlo en el módulo de un dominio obligaría a `exceptions/handlers.py` y al router de auth a importar de `scan_schemas` (ver D-10 en `design.md`).
- **La contraseña en claro nunca se persiste ni se retorna** (RN-WS-12): ningún schema de respuesta de este change expone `password` ni `hashed_password`, y no se introduce ningún `UserResponse` — el registro devuelve directamente un token, no un eco del usuario creado.
- Sin cambios en `.env`, en `core/settings.py`, en el modelo ORM ni en las rutas montadas. **No hay breaking changes**: se rellenan dos módulos que hasta ahora no exportaban nada.

Fuera de alcance explícito: la emisión y verificación real del JWT (`core/security.py`, CHANGE-04/CHANGE-06), el hashing bcrypt (CHANGE-04), la normalización a lowercase del email — que por roadmap vive en `UserRepository` (CHANGE-03) —, los *exception handlers* que producen `ErrorDetail` (CHANGE-07), y los schemas de escaneo `ScanRequest`/`ScanResponse`/`N8nPayload` (CHANGE-08).

## Capabilities

### New Capabilities
- `auth-contracts`: la forma de los datos de autenticación en la frontera del Bridge — qué se acepta al registrarse y al iniciar sesión (incluida la política de longitud de contraseña de RN-WS-15 y el rechazo de campos desconocidos), qué forma tiene la respuesta de token, cómo se representa el payload del JWT ya decodificado, y la garantía de que ninguna contraseña en claro atraviesa un schema de salida.
- `error-contract`: la forma canónica RFC 7807 de todo error de la API (`type`, `title`, `status`, `detail`, `instance`), compartida por los dominios Auth y Scan. Este change define la forma; CHANGE-07 define los handlers que la producen.

### Modified Capabilities
<!-- Ninguna. `bridge-bootstrap` exige que `schemas/auth_schemas.py` y `schemas/scan_schemas.py` existan y sean importables — ambos siguen existiendo y siendo importables; rellenarlos no invalida ninguno de sus requirements. `user-persistence` no se toca: los schemas no importan el modelo ORM ni la sesión. -->

## Impact

- **Código**: `fastapi_bridge/schemas/auth_schemas.py` (placeholder → `UserRegister`, `UserLogin`, `TokenResponse`, `TokenData`) y `fastapi_bridge/schemas/error_schemas.py` (**módulo nuevo** → `ErrorDetail`). `fastapi_bridge/schemas/scan_schemas.py` sigue siendo un placeholder: solo se le corrige el docstring obsoleto, que apunta a un número de change desactualizado y aún promete `ErrorDetail`. `tests/test_structure.py` verifica existencia e importabilidad de una lista de módulos esperados, sin exigir un conjunto exacto, así que el módulo adicional no lo rompe.
- **Tests**: se agregan `fastapi_bridge/tests/test_auth_schemas.py` y `fastapi_bridge/tests/test_error_schemas.py`. Se agrega una regla a la tabla `LAYER_IMPORT_RULES` de `tests/test_layer_boundaries.py` (`schemas` no importa `fastapi`, `sqlalchemy` ni `httpx`) — es una línea por regla, tal como quedó diseñado en CHANGE-00a. `tests/test_structure.py` sigue en verde sin cambios.
- **Dependencias**: ninguna nueva. `EmailStr` requiere `email-validator`, que ya entra por `pydantic[email]>=2.0` en `fastapi_bridge/requirements.txt` desde CHANGE-00a — este change es el primero que lo ejercita de verdad, así que la tarea 1.2 lo verifica instalado antes de escribir código.
- **Configuración**: no consume `Settings`. `TOKEN_EXPIRE_HOURS` **no** se lee desde el schema: `expires_in` es un campo que el `AuthService` (CHANGE-04) llena a partir de la config, manteniendo el schema libre de dependencias.
- **Contrato compartido con el frontend**: `UserRegister`/`UserLogin` deben mantenerse en paridad con los schemas Zod de CHANGE-14, y `TokenResponse` con el `authStore` de CHANGE-13. Cualquier divergencia produce un 422 que el usuario ve como un fallo inexplicable del formulario.
- **Desbloquea**: CHANGE-03 (`UserRepository`) y, tras él, todo el camino crítico de Auth (04 → 05/06 → 22).
- **Riesgo**: bajo y contenido. No hay I/O, no hay estado, no hay infraestructura. El riesgo real es de *contrato*: una decisión de validación equivocada acá (límite de longitud, campos extra, tipo de `expires_in`) se propaga a cuatro changes posteriores y al frontend, y corregirla después es un cambio incompatible. Por eso las decisiones de validación se surfacean al usuario en `design.md`.
