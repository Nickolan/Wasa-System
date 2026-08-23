## REMOVED Requirements

### Requirement: Superficie de API acotada al scaffold

**Reason**: El requirement describe un estadio del proyecto que este change termina: el de "ningún router de dominio montado". Su escenario "Sólo /health está expuesto" deja de ser cierto en el momento en que el borde HTTP del dominio scan queda implementado, y no puede reescribirse sin que su nombre mienta. Se reemplaza por un requirement equivalente pero enunciado en términos del criterio duradero —qué está montado y qué no— en vez del estadio temporal del scaffold.

**Migration**: Sustituido por el requirement "Superficie de API acotada a los dominios ya implementados", que conserva la misma garantía (ningún router se monta antes de que su change lo implemente) y la misma verificación sobre `app.routes`, actualizando el conjunto esperado. Ninguna garantía se pierde: la restricción sigue siendo que la superficie de API es exactamente la de los dominios implementados, ni una ruta más.

## ADDED Requirements

### Requirement: Superficie de API acotada a los dominios ya implementados

El servicio SHALL exponer únicamente el endpoint de salud y los endpoints de aquellos dominios cuyo change de implementación ya ocurrió. Un router de dominio que existe como módulo pero cuya implementación todavía no ocurrió NO SHALL estar montado en la aplicación, y su ruta SHALL responder `404`. Ninguna otra ruta de aplicación SHALL aparecer en la superficie por efecto de middlewares, handlers de error o políticas de borde. En el estadio actual la superficie es el endpoint de salud más el disparo de escaneo; el dominio auth sigue sin montarse.

#### Scenario: La superficie expuesta es el health más el disparo de escaneo

- **WHEN** se inspecciona `app.routes` descartando las rutas internas de FastAPI (`/docs`, `/openapi.json`, `/redoc`)
- **THEN** las únicas rutas de aplicación registradas son `GET /health` y `POST /api/v1/scan/start`

#### Scenario: Endpoints de dominio aún no implementados

- **WHEN** se hace `POST /api/v1/auth/register`
- **THEN** la respuesta es `404`, porque ese router todavía no está montado

#### Scenario: El disparo de escaneo ya no responde "no encontrado"

- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la respuesta NO es `404`: el router de scan está montado y la ruta existe
