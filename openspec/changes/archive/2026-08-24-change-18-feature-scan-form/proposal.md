## Why

Hoy el frontend tiene el contrato del escaneo (`entities/scan`, CHANGE-17), el estado de sesión con el JWT (`app/stores/authStore.ts`, CHANGE-13) y los primitivos de UI (`shared/ui`, CHANGE-15) — pero **nada los conecta**. `src/shared/api/` y `src/features/` contienen únicamente un `.gitkeep`: no existe cliente HTTP, no existe formulario, y el token que el `authStore` guarda no llega a ninguna petición. El sistema no puede disparar un escaneo desde la Landing, que es la razón de ser del producto (Flujo 3 de la KB, HU-02-01..05, HU-05-01..03).

Este change cierra ese hueco: el cliente HTTP que adjunta la credencial e invalida la sesión ante un `401`, y el formulario de escaneo que valida con el schema ya existente, muestra el error correcto por cada código de rechazo del Bridge y redirige al Dashboard cuando el escaneo queda encolado (RN-WS-08).

Además resuelve una deuda que CHANGE-17 dejó explícitamente anotada para este momento (su Open Question 2 y su riesgo R-2): `ScanApiError` y `AuthApiError` declaran hoy **la misma forma dos veces**, y el guard que debía impedir su divergencia vive en `tests/`, que `tsconfig.app.json` no compila — verificado: cambiar el tipo de un campo pasa `npm run build` y `npm run test:run` sin aviso. La unificación se difirió hasta tener `shared/api/`, y `shared/api/` nace en este change.

## What Changes

- **Cliente HTTP compartido** (`shared/api/`, hoy vacío):
  - `problemDetails.ts`: el tipo `ProblemDetails` (los cinco miembros RFC 7807) declarado **una sola vez** para todo el frontend, más el guard de runtime que decide si un cuerpo de error recibido tiene esa forma. Es el espejo del `error_schemas.py` del Bridge (D-10 de CHANGE-02): un contrato transversal no vive en el módulo de un dominio.
  - `axiosInstance.ts`: instancia Axios con `baseURL` tomada de `@shared/config/env`, interceptor de request que adjunta `Authorization: Bearer <token>` e interceptor de response que, ante un `401`, invalida la sesión del cliente.
  - **La credencial y la invalidación entran por inyección, no por import.** `shared/` no puede importar `@app/stores/authStore` sin violar la dirección de capas de FSD que `tests/fsd-boundaries.test.ts` verifica (`app → … → shared` es unidireccional). El cliente expone un punto de configuración; la capa `app` lo cablea al `authStore` al arrancar.
- **Feature del formulario de escaneo** (`features/scan-form/`, capa hoy vacía):
  - `api/submitScan.ts`: `POST /api/v1/scan/start`, devuelve `ScanResponse` ante `202` y lanza un error de dominio tipado ante cualquier rechazo (`401`, `400`/`422`, `429`, `502`, `5xx`) o ante un fallo de red sin respuesta.
  - `model/useScanForm.ts`: `useForm` + `zodResolver(scanSchema)`, estado de carga, error de servidor y la traducción de cada código de rechazo a su mensaje en español (HU-05-03); en `202`, mensaje de éxito y redirección a `VITE_DASHBOARD_URL` (RN-WS-08, HU-05-01); en `401`, cierre de sesión y "Sesión expirada".
  - `ui/ScanForm.tsx`: los cinco campos renderizados con los primitivos de `@shared/ui`, con el botón deshabilitado mientras la declaración ética no esté marcada o haya un envío en curso (HU-02-05, HU-05-02).
- **Unificación del contrato de error del cliente**: `ScanApiError` (en `entities/scan`) y `AuthApiError` (en `entities/user`) pasan a ser **alias** del `ProblemDetails` de `shared/api`. Los dos nombres siguen exportándose desde la API pública de su slice, así que ningún consumidor cambia sus imports; lo que cambia es que la forma se declara una sola vez y una divergencia deja de ser posible por construcción, en vez de estar vigilada por un guard que el build no ejecuta. El guard entre slices de `tests/scan-schema.test.ts` queda obsoleto y se retira.
- **Cableado en la capa `app`**: un único punto que conecta el cliente HTTP con el `authStore` (lectura del token y `logout()` ante `401`), en la misma línea que el punto único de hidratación que ya existe.
- **Tests de estructura actualizados, no relajados**: `tests/structure.test.ts` afirma hoy que `src/shared/api/` y `src/features/` contienen únicamente `.gitkeep`. Esa afirmación caduca con este change y pasa a describir los módulos concretos que lo pueblan (mismo criterio que D-9 de CHANGE-17).
- **Sin cambios en el backend, sin cambios en el schema de validación, sin nuevas dependencias**: `axios`, `react-hook-form`, `@hookform/resolvers` y `zod` ya están instalados.
- **Fuera de alcance**: el muro de autenticación, los modales de login/registro y la composición de la landing (CHANGE-19); el feature de auth y su uso del cliente HTTP (CHANGE-16, que consumirá el mismo `axiosInstance` sin modificarlo); el diseño visual definitivo (CHANGE-20).

## Capabilities

### New Capabilities
- `http-client`: el cliente HTTP del frontend — a dónde apunta, cómo obtiene y adjunta la credencial de sesión sin conocer el dominio, qué hace ante un `401`, cómo distingue un rechazo del Bridge de un fallo de red, y la forma única del cuerpo de error RFC 7807 que el resto del frontend consume.
- `scan-submission`: el envío del escaneo desde la Landing — cómo se compone y despacha la solicitud, qué significa cada código de respuesta para el usuario, qué mensaje ve ante cada rechazo, qué pasa al quedar el escaneo encolado (redirección al Dashboard), y cómo se renderiza y se habilita el formulario.

### Modified Capabilities
- `scan-form-contracts`: el error de la API del escaneo deja de declararse dentro de la slice `entities/scan` y pasa a ser el contrato único de `shared/api`, re-exportado por la API pública de la slice bajo el mismo nombre. Cambia **dónde vive la declaración** y **qué la garantiza** (chequeo de tipos del build, en vez de un guard fuera del alcance de compilación), no la forma ni los nombres de sus miembros.
- `auth-form-contracts`: el mismo cambio para el error de la API de autenticación (`AuthApiError` en `entities/user`). Se toca en este change y no en CHANGE-16 porque una unificación a medias —un contrato compartido que una sola slice usa— no elimina la divergencia, solo la mueve.

## Impact

- **Código nuevo**:
  - `wasa-landing/src/shared/api/problemDetails.ts`, `wasa-landing/src/shared/api/axiosInstance.ts`
  - `wasa-landing/src/features/scan-form/` (`api/submitScan.ts`, `model/useScanForm.ts`, `ui/ScanForm.tsx`, `index.ts`)
  - el punto de cableado del cliente HTTP en la capa `app`
- **Código modificado**:
  - `wasa-landing/src/entities/scan/model/types.ts` y `wasa-landing/src/entities/user/model/types.ts` (el tipo de error pasa a ser alias del contrato compartido)
  - `wasa-landing/src/app/` (invocación del cableado, junto a la hidratación existente)
  - `wasa-landing/tests/structure.test.ts` (las aserciones sobre `src/shared/api/` y `src/features/`)
  - `wasa-landing/tests/scan-schema.test.ts` (retiro del guard entre slices, hoy inocuo)
  - `.gitkeep` de `src/shared/api/`, `src/features/` y `src/app/providers/`, que dejan de hacer falta
- **Tests nuevos**: cliente HTTP (adjuntado de credencial, `401`, normalización del error, fallo de red), `submitScan` (un caso por código de respuesta), `useScanForm` (carga, doble submit, mensajes, redirección) y `ScanForm` (render, habilitación del botón, errores inline).
- **Dependencias**: ninguna nueva.
- **Consumidores aguas abajo**: CHANGE-16 (`feature-auth`) usará el mismo `axiosInstance` y el mismo `ProblemDetails`; CHANGE-19 monta `<ScanForm />` dentro del `ScanFormWidget` detrás del muro de autenticación.
- **Superficie de seguridad tocada** (governance ALTO): el token de sesión pasa a viajar en cada petición al Bridge y el `401` pasa a poder cerrar la sesión del usuario. No cambia dónde se guarda el token ni cómo se persiste — eso lo fijó CHANGE-13 y este change solo lo consume.
- **Limitación conocida, heredada del backend**: el `Retry-After` que el Bridge emite en el `429` **no es legible por el navegador**, porque su `CORSMiddleware` no declara `expose_headers`. El mensaje de límite excedido no puede indicar cuántos minutos faltan sin un cambio en el Bridge (ver `design.md`).
