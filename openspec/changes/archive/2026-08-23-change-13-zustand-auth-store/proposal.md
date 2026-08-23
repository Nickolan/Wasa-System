## Why

La Landing Page hoy **no tiene noción de sesión**. `wasa-landing/src/` es scaffold puro: `app/stores/` contiene únicamente un `.gitkeep` anotado `# CHANGE-13 — authStore.ts`, y `shared/lib/` sólo el fixture `aliasProbe.ts`. No existe ningún lugar donde vivan un JWT, un email autenticado ni el booleano que decide qué se le muestra al visitante. Sin eso, **RN-WS-10** (el formulario de escaneo está oculto para no autenticados, en su lugar el muro de auth) no es implementable: no hay predicado sobre el cual ramificar.

Ese hueco bloquea la rama entera del frontend: CHANGE-14 (schemas Zod de auth), CHANGE-16 (feature-auth, que llama a `login()` tras un 200 del Bridge y cuyo interceptor Axios lee el token), CHANGE-18 (feature-scan-form, que sólo se renderiza autenticado), CHANGE-19/20 (widgets y composición de la Landing, que ramifican sobre `isAuthenticated`) y el smoke test E2E de CHANGE-22.

Y hay una segunda mitad del problema, más específica: **RN-WS-14** dice que los JWT expiran (default 24h) y que *"al expirar, el frontend limpia el authStore y muestra nuevamente el muro"*. Guardar el token en `localStorage` sin más lo hace sobrevivir a la recarga — pero también lo hace sobrevivir a su propia expiración. Una sesión persistida sin validación de vencimiento produce el peor de los estados: una UI que se cree autenticada, muestra el formulario de escaneo, y recién descubre la verdad cuando el Bridge responde `401`. Este change existe para que la persistencia (**HU-06-04**) venga con su condición de validez incorporada, y para que exista la contrapartida explícita: el borrado local de la sesión (**HU-06-05**).

## What Changes

- **`wasa-landing/src/shared/lib/utils.ts`** (nuevo) — función pura `jwtIsExpired(token: string): boolean`, que decodifica el payload del JWT (segmento central, base64url) y compara su claim `exp` contra el reloj actual. **Sin librería adicional**: `atob` + `JSON.parse`. No verifica la firma (imposible en el cliente, y no es su función: la autoridad sobre la validez del token sigue siendo el Bridge); decide únicamente sobre vigencia temporal. **Falla cerrada**: todo token que no se pueda leer con confianza —malformado, payload no decodificable, JSON inválido, `exp` ausente o no numérico— se reporta como expirado. Vive en `shared/`, sin conocimiento del dominio WASA: parsea un JWT, no "la sesión de WASA".
- **`wasa-landing/src/app/stores/authStore.ts`** (nuevo) — store Zustand, única fuente de verdad de la sesión en el cliente:
  - estado: `token: string | null`, `email: string | null`, `isAuthenticated: boolean`, con el invariante `isAuthenticated === (token !== null)` mantenido siempre en una única transición atómica;
  - `login(token, email)` — establece la sesión en memoria y la persiste;
  - `logout()` — borra la sesión de memoria y del almacenamiento. **Limpieza local únicamente**: no emite ninguna petición al Bridge (HU-06-05; el JWT es stateless, no hay nada que revocar del lado del servidor);
  - `hydrate()` — al arrancar la aplicación, lee la sesión persistida, la admite **sólo si el token no expiró** (vía `jwtIsExpired`), y en cualquier otro caso deja la aplicación no autenticada **y purga lo que haya guardado**, de modo que un token vencido no sobreviva a la recarga que lo descubrió.
- **`wasa-landing/src/app/App.tsx`** (modificado) — invoca `hydrate()` en un `useEffect` al montar, una sola vez. Es el único punto de la aplicación que dispara hidratación.
- **`wasa-landing/tests/`** — suite nueva para ambas piezas (`jwtIsExpired`, el store, y la hidratación al montar `App`). El proyecto ubica sus tests en `wasa-landing/tests/`, no colocados junto al código (`vite.config.ts` → `test.include: ['tests/**/*.test.{ts,tsx}']`).
- **`wasa-landing/tests/structure.test.ts`** (modificación declarada por adelantado, no un hallazgo del apply) — su caso `'src/app/stores/authStore.ts does not exist'` afirma hoy exactamente lo contrario de lo que este change construye y **debe invertirse**. Es el único test archivado que este change contradice.
- **`wasa-landing/src/app/stores/.gitkeep`** y **`wasa-landing/src/shared/lib/.gitkeep`** — se eliminan: su única razón de ser era sostener el directorio vacío hasta que llegara el change que lo poblara (D-10 de CHANGE-00b), y ambos directorios pasan a contener el código que los `.gitkeep` anuncian.

**Fuera de alcance, explícitamente** (cada uno pertenece a su change y este change no lo adelanta):
- El interceptor Axios que adjunta el `Authorization: Bearer` — es CHANGE-16. Este change sólo garantiza que `token` sea legible desde el store para que aquél lo consuma.
- Los modales de login/registro, los schemas Zod y cualquier petición HTTP de auth — CHANGE-14/16.
- El muro de autenticación y el botón "Cerrar sesión" como UI — CHANGE-19/20. Acá se implementa el estado y las acciones que esa UI invocará, no la UI.
- Detectar la expiración **durante** una sesión abierta (temporizador, o reacción al `401` del Bridge). Este change valida vencimiento en la hidratación, que es lo que pide HU-06-04. La reacción al `401` en vuelo es del interceptor de CHANGE-16.

**No es breaking para ningún consumidor**: nada importa hoy de `app/stores/` ni de `shared/lib/utils.ts`, porque ninguno de los dos existe.

## Capabilities

### New Capabilities

- `jwt-expiry-inspection`: el veredicto de vigencia temporal de un JWT tomado en el cliente **sin verificar su firma** — qué se considera vigente, qué se considera vencido, y la regla de falla cerrada que gobierna todo token que no se pueda leer con confianza (malformado, no decodificable, sin claim `exp`, con `exp` no numérico). Es deliberadamente ajeno al dominio WASA: describe una decisión sobre un JWT, no sobre "la sesión de WASA", y por eso vive en la capa `shared/`.
- `auth-session-state`: la **sesión autenticada tal como la ve el frontend** — qué constituye estar autenticado, qué se recuerda de una sesión y qué no, que la sesión sobreviva a una recarga sólo mientras el token siga vigente, que el cierre de sesión sea local y completo, y que ningún resto de una sesión inválida quede almacenado. Es el predicado sobre el que ramificarán RN-WS-10 (muro vs. formulario) y el consumidor del token en CHANGE-16.

### Modified Capabilities

- `landing-bootstrap`: su requirement **"El scaffold no implementa funcionalidad de dominio"** deja de ser cierto. Su escenario "Sin authStore" afirma literalmente que `src/app/stores/authStore.ts` no existe y que el directorio queda vacío con sólo un `.gitkeep` — exactamente lo que este change construye. Se lo **retira y se lo reemplaza** por un requirement equivalente enunciado como criterio duradero ("cada pieza de dominio aparece únicamente en el change que la implementa") en vez de como el inventario de un estadio temporal; un `MODIFIED` no alcanzaba porque el nombre del requirement y el de uno de sus escenarios quedan desmentidos, y los nombres son parte del contrato. Las otras dos garantías del requirement (sin schemas ni componentes de dominio; sin cliente HTTP configurado) se conservan intactas.

<!-- NO cambian: el resto de `landing-bootstrap` se consume tal cual — las seis capas FSD, los
     alias, el pipeline Tailwind y el manifiesto de dependencias (`zustand` ya está declarado
     e importable: su escenario "Zustand importable" pasa de ser una promesa a estar ejercido
     por código real, sin que su texto cambie). `runtime-configuration` no cambia: este change
     no agrega, quita ni renombra ninguna variable de entorno, y no lee `import.meta.env` —
     `shared/config/env.ts` no se toca. Las capabilities de backend (`bridge-bootstrap`,
     `api-edge-security`, `scan-*`) no tienen contacto alguno: este change es 100% frontend y
     no emite ninguna petición de red. -->

## Impact

**Código afectado**
- `wasa-landing/src/shared/lib/utils.ts` — archivo nuevo.
- `wasa-landing/src/app/stores/authStore.ts` — archivo nuevo.
- `wasa-landing/src/app/App.tsx` — se agrega el `useEffect` de hidratación; el árbol que renderiza (`<LandingPage />`) no cambia.
- `wasa-landing/src/app/stores/.gitkeep` y `wasa-landing/src/shared/lib/.gitkeep` — se eliminan.
- `wasa-landing/tests/*` — tests nuevos, más la inversión declarada del caso de `structure.test.ts`.

**Código NO afectado (explícito)**
- `wasa-landing/src/shared/config/env.ts`, `src/shared/lib/aliasProbe.ts`, `src/app/main.tsx`, `src/app/index.css`, `src/pages/LandingPage/index.tsx`: no se modifican.
- `vite.config.ts`, `tsconfig.*.json`, `package.json`: sin cambios. **No se agrega ninguna dependencia** — `zustand@^5.0.15` ya está declarada y la decodificación del JWT se hace con APIs del navegador.
- `src/entities/`, `src/features/`, `src/widgets/`, `src/shared/ui/`, `src/shared/api/`: siguen conteniendo únicamente sus `.gitkeep` anotados.
- Todo `fastapi_bridge/`, PostgreSQL `db_fuzzing`, el workflow de n8n y el Dashboard existente: sin contacto.

**Dependencias — satisfechas**

`CHANGES.md` declara `CHANGE-13 → depende de CHANGE-00b`. Verificado en el árbol de trabajo: el scaffold `wasa-landing/` existe con las seis capas FSD, los alias `@app`/`@shared` resuelven en Vite, `tsc` y Vitest, el runner de tests está operativo y `zustand@^5.0.15` figura en `dependencies`. **No hay ninguna dependencia insatisfecha**: este change es implementable de punta a punta en el árbol actual, sin esperar ninguna rama de backend.

**Governance ALTO — el apply no procede de forma autónoma**

Este change escribe credenciales de sesión en el almacenamiento del navegador del usuario y define el predicado que gobierna el acceso al formulario de escaneo. No está cubierto por la excepción MEDIUM que el `CLAUDE.md` del proyecto concede a CHANGE-01..07 (backend Auth): rige el nivel **ALTO** por defecto. En consecuencia, las decisiones no obvias aisladas en `design.md` (**D-1** falla cerrada y sus casos límite, **D-2** purga durante la hidratación, **D-3** forma y nombre del almacenamiento, **D-4** `localStorage` inaccesible o que lanza, **D-5** tolerancia de reloj, **D-6** el destello de estado no autenticado antes de hidratar) **requieren revisión y confirmación explícita del usuario antes de correr `/opsx:apply`**. El propose no queda bloqueado por esto; el apply sí.

**Riesgo aceptado, heredado y declarado**

Persistir el JWT en `localStorage` lo deja legible por cualquier script que corra en el origen: un XSS equivale a robo de sesión, y no hay revocación del lado del servidor que lo mitigue (JWT stateless, sin refresh tokens — DD-01/SU-03). La decisión de usar `localStorage` es previa a este change (`knowledge-base/01_vision_y_objetivos.md`, `08_arquitectura_propuesta.md`, HU-06-04) y este change la **implementa, no la revisa**. Se deja constancia porque el nivel de governance lo exige. Consecuencia práctica que sí se acata acá: en el almacenamiento se guarda el mínimo necesario para restaurar la sesión —el token y el email— y nada más; nunca la contraseña, ni en claro ni derivada.

**Coordinación entre agentes**

Este change corre en el gate 2 junto con CHANGE-15 y CHANGE-17 (Agente C). Ninguno de los tres toca los mismos archivos de producción, pero los tres agregan casos a `wasa-landing/tests/`; `structure.test.ts` es el único archivo compartido con riesgo real de conflicto, y este change lo modifica en un solo caso puntual e identificado.
