## Why

`core/security.py` (CHANGE-04) ya sabe verificar un JWT: `decode_access_token` valida firma, algoritmo y vencimiento, y devuelve `TokenData(email=None)` ante cualquier token que no sirva. `POST /api/v1/auth/login` (CHANGE-05) ya emite esos tokens. Pero **nada del Bridge consume un token todavía**: no existe forma de que una ruta diga "esta operación requiere un usuario autenticado". RN-WS-11 —`POST /api/v1/scan/start` requiere un JWT válido en `Authorization`, y sin él responde 401— no es hoy expresable en código.

Este change agrega la única pieza que falta: la dependencia de FastAPI que convierte un header `Authorization: Bearer <jwt>` en el email del usuario autenticado, o en un 401 uniforme. Es lo que desbloquea a CHANGE-12 (`POST /api/v1/scan/start`), el punto de confluencia del camino crítico, que sólo tendrá que declarar `Depends(get_current_user)` sin volver a decidir nada sobre JWT.

## What Changes

- **Se agrega el esquema de seguridad `oauth2_scheme`** (`OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")`) en `fastapi_bridge/core/dependencies.py`: extrae el token del header `Authorization` y declara el esquema Bearer en OpenAPI, para que `/docs` muestre qué rutas están protegidas.
- **Se agrega la dependencia `get_current_user`** en el mismo módulo: recibe el token del esquema y la `Settings` por `Depends`, delega la validación en `security.decode_access_token(token, settings)` y devuelve el email del sujeto (`str`). Sin `try/except` propio: `decode_access_token` no lanza (CHANGE-04, D-7), así que la única condición de rechazo es `token_data.email is None`.
- **El rechazo es un `401` uniforme en formato RFC 7807**, con desafío `WWW-Authenticate` conforme a RFC 6750. Los cuatro motivos de rechazo de un token presente —malformado, firmado con otra clave, vencido, sin `sub`— producen **exactamente la misma respuesta**: distinguirlos le diría a un atacante si su token caducó o si su firma es la equivocada. La traducción a RFC 7807 la hace `http_exception_handler` (CHANGE-07), ya registrado sobre `StarletteHTTPException`, que además ya traslada los headers de la excepción a la respuesta.
- **La dependencia no consulta la base de datos**: el token firmado por el propio servicio es la prueba de identidad; no se verifica que la fila de `users` siga existiendo. Sin I/O, la dependencia queda pura y no agrega latencia ni una conexión por request protegido. Ver `design.md` D-5 para la consecuencia (un token sobrevive a la baja de su usuario hasta su vencimiento) y por qué es aceptable en el alcance v1.2.
- **Se agrega el alias `CurrentUserEmail`** (`Annotated[str, Depends(get_current_user)]`) exportado por el mismo módulo, para que CHANGE-12 anote `user_email: CurrentUserEmail` sin repetir el cableado ni poder equivocarse de dependencia.
- **No se monta ni se modifica ninguna ruta.** `POST /api/v1/scan/start` sigue respondiendo `404` al terminar este change (lo monta CHANGE-12), y las rutas de auth siguen siendo públicas. La superficie de API declarada por `bridge-bootstrap` no cambia.

## Capabilities

### New Capabilities
- `request-authentication`: la autenticación de una solicitud a partir del token Bearer que trae. Cubre la extracción del token del header, la resolución de la identidad del usuario autenticado a partir del token válido, la forma y la uniformidad del rechazo `401` ante un token ausente o inválido, el hecho de que la dependencia no implemente criptografía propia ni consulte la persistencia, y su sustituibilidad por `dependency_overrides` para que los changes que la consuman puedan probarse sin emitir tokens reales.

### Modified Capabilities
Ninguna. El change no altera requisitos existentes: no agrega ni quita rutas (`bridge-bootstrap` §Superficie de API expuesta sigue vigente tal cual), no cambia la política de borde (`api-edge-security`), no toca las primitivas de JWT (`access-token`), no cambia los contratos Pydantic (`auth-contracts`) y no agrega un manejador de errores nuevo — el `401` que emite viaja por `http_exception_handler`, cuyo comportamiento ya está especificado en `error-rendering` (§Los headers de una excepción HTTP sobreviven a la traducción, §Cada clase de error tiene una URI de tipo estable y un título propio).

## Impact

**Código de producción**
- `fastapi_bridge/core/dependencies.py` — se agregan `oauth2_scheme`, `get_current_user` y el alias `CurrentUserEmail`, junto al `get_auth_service` ya existente (CHANGE-05). Es el único archivo de producción que este change modifica.

**Se consume sin modificar**: `core/security.py` (`decode_access_token`), `core/settings.py` (`Settings`, `get_settings`), `schemas/auth_schemas.py` (`TokenData`), `exceptions/handlers.py` (`http_exception_handler`), `main.py`.

**Sin tocar**: `api/v1/scan/router.py` (sigue sin operaciones y sin montar), `api/v1/auth/router.py`, `services/`, `uow/`, `repositories/`, `db/`, el esquema de la base y las tablas compartidas `scans`/`vulnerabilities`.

**Tests**
- Nuevos tests en `fastapi_bridge/tests/test_auth_dependencies.py` (donde ya viven los de `get_auth_service`): la dependencia invocada como función pura, y una **ruta sonda** montada sobre una app descartable construida en el propio test para ejercitar las cinco condiciones de aceptación desde el borde HTTP real (sin adelantar el montaje de scan, que es de CHANGE-12).
- `fastapi_bridge/tests/test_layer_boundaries.py` — se agrega un anclaje AST a nivel de módulo (no una fila de `LAYER_IMPORT_RULES`, que aplica por directorio y rompería `core/security.py`): `core/dependencies.py` no importa `jose` ni construye su propia validación de token.

**Dependencias**: ninguna nueva. `OAuth2PasswordBearer` viene con `fastapi`, ya declarado en `requirements.txt`.

**APIs y consumidores**
- CHANGE-12 (`POST /api/v1/scan/start`): pasa a tener la dependencia que necesita para cumplir RN-WS-11, y una forma probada de sustituirla en tests.
- Frontend (CHANGE-17, interceptor de Axios): queda fijado el contrato del `401` que dispara la limpieza del `authStore` y el muro de autenticación (RN-WS-14).
- `/docs`: no cambia todavía. El esquema de seguridad se declara, pero recién aparece asociado a una operación cuando CHANGE-12 monte la ruta protegida.

**Sin impacto**: base de datos, configuración (`.env` y `Settings` no cambian), rate limiting, CORS, superficie de API.
