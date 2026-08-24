## Why

El formulario de escaneo (HU-02-01 a HU-02-05) todavía no tiene contrato del lado del cliente: no existe ningún tipo que describa qué campos manda el navegador a `POST /api/v1/scan/start`, ni ninguna validación que corra antes de llamar al Bridge. Sin ese contrato, CHANGE-18 (`feature-scan-form`) inventará su propia forma y su propia política de validación, y la única validación real será la del backend — un 422 remoto en vez de un mensaje bajo el campo.

El backend ya fijó su lado del contrato en CHANGE-08 (`fastapi_bridge/schemas/scan_schemas.py`, capability `scan-payload-contract`): `target_url` como `HttpUrl` (solo `http`/`https`), `phpsessid` con `strip_whitespace=True, min_length=1`, `sqlmap_level` en 1..5 con default 1, `sqlmap_risk` en 1..3 con default 1, y `extra="ignore"` para que el checkbox de aceptación ética del formulario no rompa la solicitud. Este change escribe el lado del cliente de ese contrato, con paridad verificada por tests, más la única regla que **no** tiene contraparte en el backend: la declaración ética (RN-WS-01), que es una condición de la interfaz y jamás viaja por el cable.

Hay además tres trampas concretas de Zod v3 —verificadas empíricamente contra la versión instalada— que hacen que la escritura "obvia" del schema **no** cumpla las reglas de negocio: `z.string().min(1).trim()` acepta `"   "`, `z.string().url()` acepta `javascript:alert(1)` y `file:///etc/passwd`, y `z.literal(true, { message })` ignora el mensaje. Definir el schema acá, con esas tres trampas cerradas y cubiertas por tests, es más barato que descubrirlas en el formulario.

## What Changes

- Se crea la slice `entities/scan` (hoy `src/entities/` contiene únicamente la slice `user` de CHANGE-14), con el modelo de dominio del escaneo:
  - **Tipos** (`model/types.ts`): `ScanForm` (la forma del **formulario**, con el checkbox ético y los parámetros SQLMap opcionales), `ScanRequest` (el cuerpo que efectivamente viaja al Bridge — espejo exacto del `ScanRequest` Pydantic, sin el checkbox), `ScanResponse` (`scan_id`, `status: 'queued'`, `message`) y `ScanApiError` (los cinco miembros RFC 7807).
  - **`model/scanSchema.ts`** (Zod): validación de los cinco campos del formulario, más las constantes de rango y de valor por defecto de SQLMap que el test de paridad compara contra el backend.
  - **API pública de la slice** (`index.ts`): lo que CHANGE-18 puede importar desde `@entities/scan`, sin rutas profundas.
- Se cierran las tres trampas de Zod v3 con desviaciones deliberadas respecto de la escritura literal del roadmap:
  - `phpsessid`: `trim()` **antes** de `min(1)` (el orden inverso deja pasar una cadena de solo espacios, violando RN-WS-03).
  - `target_url`: `url()` **más** una restricción explícita de esquema a `http:`/`https:` (por sí solo `url()` acepta `ftp:`, `file:` y `javascript:`, violando RN-WS-02).
  - `ethical_consent`: `z.literal(true)` con `errorMap` (un `{ message }` simple no llega al issue `invalid_literal`; el mensaje quedaría en inglés).
- Se declara explícitamente que el checkbox ético **no** forma parte del cuerpo que viaja al Bridge (`ScanRequest` lo excluye por tipo), en paridad con el `extra="ignore"` del backend.
- Se actualiza `tests/structure.test.ts`, que hoy afirma que `src/entities/` contiene **únicamente** la slice `user` — esa afirmación caduca con este change y pasa a describir también la slice `scan`.
- Sin cambios de UI, sin llamadas de red, sin tocar `entities/user`, el `authStore` (CHANGE-13) ni el backend.

## Capabilities

### New Capabilities
- `scan-form-contracts`: la forma y las reglas de validación de los datos del escaneo en el cliente — qué campos tiene el formulario, qué URL objetivo y qué sesión se aceptan antes de llamar al Bridge, qué rangos y valores por defecto rigen los parámetros de SQLMap, qué exige la declaración ética, qué forma tienen la respuesta de aceptación y el error de la API, y la garantía de paridad con el contrato Pydantic del Bridge (`scan-payload-contract`).

### Modified Capabilities
<!-- Ninguna. `scan-payload-contract`, `scan-initiation` y `error-contract` son del
     Bridge y quedan intactos: esta capability los refleja del lado del cliente, no
     los modifica. `auth-form-contracts` (CHANGE-14) tampoco cambia: la slice `user`
     no se toca. `landing-bootstrap` no declara requisitos sobre el contenido de
     `entities/`. -->

## Impact

- **Código nuevo**: `wasa-landing/src/entities/scan/` (`model/types.ts`, `model/scanSchema.ts`, `index.ts`).
- **Código modificado**: `wasa-landing/tests/structure.test.ts` (la aserción "`src/entities/` contiene únicamente `user`").
- **Tests nuevos**: `wasa-landing/tests/scan-schema.test.ts` (Vitest) y `wasa-landing/tests/scan-schemas-parity.test.ts`, este último lee `fastapi_bridge/schemas/scan_schemas.py` y verifica que los rangos 1..5 / 1..3 y los defaults del frontend siguen siendo los del backend — el mismo mecanismo que `tests/auth-schemas-parity.test.ts` (D-7 de CHANGE-14).
- **Dependencias**: ninguna nueva — `zod@3.25.76` ya está instalado (CHANGE-00b/13/14). Los helpers de test `tests/support/zod.ts` y `tests/support/pythonConstants.ts` ya existen y se reutilizan.
- **Consumidores aguas abajo**: CHANGE-18 (`feature-scan-form`) importa de `@entities/scan` — este contrato fija la forma del payload que su `submitScan` envía y la de la respuesta que recibe.
- **Fuera de alcance**: el componente de formulario, `react-hook-form`/`zodResolver`, el cliente HTTP y el interceptor de `Authorization`, el manejo de 401/429/502, la redirección al Dashboard (RN-WS-08), y la validación en runtime de la respuesta del Bridge (`ScanResponse` y `ScanApiError` son tipos, no schemas de parseo — mismo criterio que D-10 de CHANGE-14).
- **Discrepancia de la KB resuelta en este change**: HU-02-04 menciona "clamping a rango" para los parámetros SQLMap, mientras que RN-WS-04/05 y `scan-payload-contract` exigen **rechazo** sin recorte. Este change implementa el rechazo (ver D-5 en `design.md`).
