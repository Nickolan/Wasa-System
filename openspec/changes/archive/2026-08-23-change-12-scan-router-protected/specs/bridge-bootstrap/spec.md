## REMOVED Requirements

### Requirement: Superficie de API expuesta por el servicio

**Reason**: El requirement vigente en `openspec/specs/bridge-bootstrap/spec.md` (renombrado por CHANGE-05 al montar auth) trae el escenario "El endpoint de scan aún no está disponible", que afirma que `POST /api/v1/scan/start` sigue respondiendo `404`. Este change monta y protege esa ruta: el escenario queda desmentido por su propio nombre, y los nombres de escenario no se pueden reescribir dentro de un `MODIFIED` sin que mientan (el validador de `openspec` exige conservar el nombre de todos los escenarios existentes; mismo caso ya resuelto para `api-edge-security` en este mismo change). Se retira el bloque completo del requirement y se lo reemplaza en `ADDED Requirements`.

**Migration**: Sustituido por "Superficie de API expuesta por el servicio con scan montado" en `ADDED Requirements`, que conserva las mismas garantías (el endpoint de salud y las dos operaciones de auth siguen disponibles y con su contrato exacto; montar un router sigue siendo una decisión explícita del change que implementa sus operaciones) y actualiza únicamente el escenario de scan: de "aún no está disponible" a "está disponible y protegido, montado por su propio change". Ninguna garantía se pierde.

## ADDED Requirements

### Requirement: Superficie de API expuesta por el servicio con scan montado

La aplicación SHALL exponer, además del endpoint de salud, las dos operaciones de autenticación (`POST /api/v1/auth/register` y `POST /api/v1/auth/login`) y la operación de disparo de escaneo (`POST /api/v1/scan/start`), cada una montada desde `create_app()` por el change que implementó sus operaciones (auth por CHANGE-05, scan por este change). Montar un router SHALL seguir siendo una decisión explícita del change correspondiente, nunca un efecto colateral de otro change.

#### Scenario: Rutas de aplicación registradas

- **WHEN** se inspecciona `app.routes` descartando las rutas internas de FastAPI (`/docs`, `/openapi.json`, `/redoc`)
- **THEN** las rutas de aplicación registradas son exactamente `GET /health`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login` y `POST /api/v1/scan/start`

#### Scenario: Los endpoints de auth están disponibles

- **WHEN** se hace `POST /api/v1/auth/register` o `POST /api/v1/auth/login` con un cuerpo válido
- **THEN** la respuesta no es `404`: ambas rutas están montadas y atendidas por el router de auth

#### Scenario: El endpoint de scan está disponible y protegido

- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la respuesta no es `404`: el router de scan, montado por este change, atiende la solicitud y aplica su propio guard de autenticación sobre ella

#### Scenario: El endpoint de salud conserva su contrato

- **WHEN** se hace `GET /health` con los routers de auth y de scan montados
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`
