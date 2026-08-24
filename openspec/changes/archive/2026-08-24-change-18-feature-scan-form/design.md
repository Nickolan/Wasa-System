## Context

Motivación en `proposal.md` §Why. Lo que este design necesita fijar es el estado real del código con el que se trabaja y las tres restricciones que condicionan el enfoque.

**Lo que ya existe y no se toca**

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Contrato y validación del escaneo | `src/entities/scan/` (CHANGE-17) | `scanSchema`, `ScanForm`, `ScanRequest`, `ScanResponse`, y las constantes `SQLMAP_LEVEL_MIN/MAX/DEFAULT` y `SQLMAP_RISK_MIN/MAX/DEFAULT` |
| Estado de sesión | `src/app/stores/authStore.ts` (CHANGE-13) | `token`, `isAuthenticated`, `login`, `logout`, `hydrate`; único módulo que toca `localStorage` |
| Primitivos de UI | `src/shared/ui/` (CHANGE-15) | `Input` (label + error accesible + borde por estado), `Checkbox`, `Button` (con `loading` que deshabilita y marca `aria-busy`), `Spinner`, `Modal` |
| Puerta de configuración | `src/shared/config/env.ts` (CHANGE-00c) | `apiBaseUrl`, `dashboardUrl`, ya validados; falla al cargar si faltan |

**Lo que está vacío**: `src/shared/api/` y `src/features/` contienen solo un `.gitkeep`, y `tests/structure.test.ts` lo afirma explícitamente.

**El Bridge, del otro lado**: `POST /api/v1/scan/start` (el router declara su propio prefijo `/api/v1/scan`; `VITE_API_BASE_URL` es el **origen** sin prefijo de versión, por D-3 de CHANGE-00c). Responde `202` con `ScanResponse`; rechaza con `401` (credencial), `400`/`422` (validación), `429` (cupo, con `Retry-After`), `502` (orquestador caído) y `500`, siempre en RFC 7807 (`error-rendering`, `scan-endpoint`).

**Restricción 1 — FSD.** `tests/fsd-boundaries.test.ts` verifica que ningún módulo importe de una capa anterior en `app → pages → widgets → features → entities → shared`. El scope del roadmap dice "el interceptor agrega `Authorization` desde `authStore`": escrito literalmente, `shared/api/axiosInstance.ts` importaría `@app/stores/authStore` y **ese test falla**. El enfoque tiene que resolver eso, no ignorarlo.

**Restricción 2 — sin coerción en el schema.** `scanSchema` usa `z.number().int()` deliberadamente (D-6 de CHANGE-17): una cadena numérica no valida. El formulario tiene que entregar números.

**Restricción 3 — deuda heredada.** `ScanApiError` y `AuthApiError` declaran hoy la misma forma dos veces, y el guard que debía impedir la divergencia vive en `tests/`, que `tsconfig.app.json` no incluye: no falla ni en `npm run build` ni en `npm run test:run` (verificado en CHANGE-17, su R-2). CHANGE-17 difirió la unificación real a este change (su Open Question 2).

## Goals / Non-Goals

**Goals:**

- Un único canal HTTP hacia el Bridge, que adjunte la credencial sin que ningún llamador la toque, y que reaccione al `401` desde un solo lugar — sirviendo también a CHANGE-16 sin modificarlo.
- Resolver el cruce de capas de forma que `shared/` siga sin conocer dominio, en vez de aflojar el test de fronteras.
- Cerrar la duplicación de la forma del error RFC 7807 con un mecanismo que el **build** verifique, no un guard fuera de su alcance.
- Un formulario que entregue números al schema y que traduzca cada rechazo del Bridge a un mensaje en español.

**Non-Goals:**

- Reabrir dónde ni cómo se persiste el token: lo fijó CHANGE-13 y acá solo se consume.
- Parsear en runtime la respuesta de éxito del Bridge (`ScanResponse` sigue siendo un tipo, no un schema — mismo criterio que D-10 de CHANGE-14 y R-5 de CHANGE-17). Sí se verifica en runtime la forma del cuerpo de **error**, porque ahí es donde llega lo que no controlamos.
- Reintentos automáticos, backoff, cancelación de la solicitud en vuelo o cola de peticiones.
- Refrescar el token: el Bridge no emite refresh tokens.
- El muro de autenticación y los modales (CHANGE-19), y el diseño visual definitivo (CHANGE-20).

## Decisions

### D-1 — La credencial entra al cliente HTTP por **inyección**, no por import

`shared/api/axiosInstance.ts` no conoce el `authStore`. Expone un punto de configuración:

```ts
// shared/api/axiosInstance.ts (forma, no implementación final)
let getToken: (() => string | null) | null = null
let onUnauthorized: (() => void) | null = null

export function configureApiClient(config: {
  getToken: () => string | null
  onUnauthorized: () => void
}): void {
  getToken = config.getToken
  onUnauthorized = config.onUnauthorized
}
```

Los interceptores se registran **una sola vez, al evaluarse el módulo**, y leen esas dos referencias en cada petición. La capa `app` las cablea al `authStore`.

*Alternativas descartadas*:

- **Importar `@app/stores/authStore` desde `shared/`** (la letra del roadmap): viola la dirección de capas y hace fallar `tests/fsd-boundaries.test.ts`. Además convertiría a `shared/` en dependiente del dominio de autenticación, justo lo contrario de lo que `runtime-configuration` y `shared-client-utils` exigen de esa capa.
- **Mover el `authStore` a `shared/`**: rompe CHANGE-13 (`storage-single-access-point.test.ts`, `structure.test.ts` afirma que `src/app/stores/` contiene exactamente `authStore.ts`) y mete dominio en `shared/`.
- **Pasar el token como parámetro en cada llamada**: cada llamador vuelve a adjuntar la credencial a mano, que es exactamente lo que el criterio de aceptación del roadmap prohíbe ("submitScan adjunta automáticamente el JWT (via interceptor, no manual)").

### D-2 — La idempotencia sale de la **forma** del cableado, no de un flag

Los interceptores se registran al importar el módulo; `configureApiClient` solo **asigna referencias**. Por lo tanto llamarlo dos veces —lo que el modo estricto de React garantiza en desarrollo— no puede duplicar interceptores ni acumular efectos: la segunda llamada pisa la primera con el mismo valor.

*Alternativa descartada*: registrar los interceptores dentro de `configureApiClient` y protegerlo con un `let configured = false`. Funciona, pero deja un estado de módulo que hay que recordar resetear entre tests y que rompe si alguien quiere reconfigurar a propósito. La versión de arriba es idempotente **por construcción**, que es lo que el spec pide.

*Dónde se cablea*: un módulo propio en `src/app/providers/`, invocado desde `App.tsx` en el mismo efecto de montaje donde ya vive `hydrate()` (punto único de arranque, como exige `auth-session-state`). Se hace en el efecto y no a nivel de módulo de `main.tsx` porque no hay ninguna petición posible antes del primer render, y porque un efecto es lo que la suite ya sabe ejercitar (`tests/app-hydration.test.tsx`).

### D-3 — El token se lee **en cada petición** con `getState()`, no con un hook

El proveedor que cablea `app` es `() => useAuthStore.getState().token`. Es la lectura imperativa correcta fuera de React: el interceptor no es un componente y no debe suscribirse a nada. La regla del proyecto de "siempre selector, nunca el store entero" gobierna a los **componentes**, que sí re-renderizan; acá no hay render que optimizar.

La clave es que la función se invoca **por petición**. Capturar `useAuthStore.getState().token` una vez al cablear dejaría fijo el token del arranque: después de un login (CHANGE-16) las peticiones seguirían yendo con la credencial vieja o sin ninguna. Está cubierto por un escenario propio del spec.

### D-4 — `ProblemDetails` vive en `shared/api/`, y las dos slices lo aliasan — **resolución de la Open Question 2 de CHANGE-17**

```ts
// shared/api/problemDetails.ts
export interface ProblemDetails { type: string; title: string; status: number; detail: string | null; instance: string }
export function isProblemDetails(value: unknown): value is ProblemDetails { /* … */ }

// entities/scan/model/types.ts
import type { ProblemDetails } from '@shared/api/problemDetails'
export type ScanApiError = ProblemDetails

// entities/user/model/types.ts  → idéntico, con AuthApiError
```

*Se unifica ahora, y se unifican las dos slices*. Las razones:

1. **El momento es este.** CHANGE-17 difirió la unificación explícitamente "hasta que CHANGE-18 cree `axiosInstance.ts`". `shared/api/` nace acá.
2. **El guard actual no protege nada.** Está verificado que cambiar el tipo de un miembro pasa build y suite sin aviso. No es un riesgo teórico: es un chequeo que da sensación de cobertura sin tenerla. Con el alias, la divergencia deja de ser expresable.
3. **El cliente HTTP necesita el guard de runtime igual.** `isProblemDetails` tiene que vivir en algún lado, y ese lado es `shared/api/`. Sin unificar, la misma forma quedaría declarada **tres** veces.
4. **Unificar una sola slice no arregla nada**, solo mueve la duplicación. Por eso `entities/user` se toca acá aunque su feature sea de CHANGE-16: son dos líneas, y hacerlo antes de que CHANGE-16 exista evita migrarlo después.

*Costo asumido*: este change modifica `entities/user`, que no estaba en su scope literal. Es una línea de tipo más su import; ningún consumidor cambia, porque `AuthApiError` y `ScanApiError` se siguen exportando con el mismo nombre desde la misma API pública.

*FSD*: `entities → shared` es la dirección permitida; el import es `import type`, y con `verbatimModuleSyntax` activo se borra al compilar — la slice sigue sin arrastrar código de red (cubierto por un escenario en los dos deltas de spec).

*Alternativa descartada*: dejarlo duplicado y "arreglarlo en CHANGE-20". No hay ningún momento posterior más barato, y CHANGE-16 nacería consumiendo la versión duplicada.

### D-5 — Se verifica en runtime el cuerpo de **error**, no el de éxito

`isProblemDetails` existe porque por el camino del rechazo llegan cosas que el Bridge no escribió: un `502` de un proxy, un cuerpo vacío, un HTML de error. Componer "sesión expirada — `undefined`" a partir de eso es un bug de interfaz garantizado.

El cuerpo de **éxito** se sigue tratando como tipo, sin parseo: viene del Bridge por el camino feliz, su forma está verificada por el test de paridad de CHANGE-17 contra `scan_schemas.py`, y parsearlo agregaría un schema Zod que nadie más necesita.

### D-6 — Rechazo y fallo de red se distinguen por la **presencia de la respuesta**

`axios.isAxiosError(error) && error.response` → hay estado HTTP: es un rechazo del Bridge. `isAxiosError` sin `response` → nunca hubo respuesta: red caída, Bridge apagado, origen bloqueado por CORS, timeout. Nada de comparar textos de mensajes.

*Por qué importa*: si se colapsan, alguien sin WiFi lee "el sistema de escaneo no está disponible" y va a reportar un incidente del backend; y el caso "el Bridge no está levantado" —el más frecuente en desarrollo— queda escondido detrás de un mensaje que apunta a n8n.

*Nota*: un fallo por CORS mal configurado también aterriza acá, sin respuesta legible. Es una limitación del navegador, no del diseño: el mensaje de conexión es lo correcto que se puede decir.

### D-7 — `submitScan` lanza una **clase de error** que transporta el estado, no el cuerpo RFC 7807 pelado

```ts
export class ScanSubmitError extends Error {
  constructor(readonly status: number | null, readonly problem: ProblemDetails | null) { super('scan submit failed') }
}
```

`status: null` significa "nunca hubo respuesta". `problem: null` significa "hubo estado, pero el cuerpo no era Problem Details".

*Desviación deliberada de la letra del roadmap*: `CHANGES.md` dice "lanza `ScanApiError`". `ScanApiError` es un **tipo de datos** (el cuerpo del error), no una clase lanzable; lanzar un objeto plano pierde el stack y obliga a cada llamador a adivinar qué recibió en el `catch`. Se conserva la intención —un error tipado, discriminable por código— con la forma correcta.

*Alternativa descartada*: dos clases (`ScanRejectedError` / `ScanNetworkError`). El único consumidor ramifica por `status`; dos clases agregan un `instanceof` más sin quitar ninguna rama.

### D-8 — El `logout` del `401` lo hace el **interceptor**, y el hook solo muestra el mensaje

Hay dos lugares donde podría vivir: el interceptor global (`http-client`) y `useScanForm`. Se elige el interceptor.

*Por qué*: el `401` significa lo mismo en cualquier endpoint protegido, y CHANGE-16 va a tener el mismo problema. Si además el hook llamara a `logout()`, habría **dos** invalidaciones por una sola respuesta — inocuo hoy (el `logout` es idempotente), pero es la clase de duplicación que después nadie se anima a sacar.

*Desviación deliberada de la letra del roadmap*: el scope de `useScanForm` dice "si 401: `authStore.logout()` + mensaje". Se conserva el efecto observable completo (sesión cerrada + mensaje "Sesión expirada"), repartido donde corresponde: la sesión la cierra el canal, el mensaje lo pone el formulario.

*Efecto colateral revisado*: cuando CHANGE-16 reciba un `401` de `/auth/login` (credenciales incorrectas), el interceptor va a invocar `logout()` sobre una sesión que no existe. `auth-session-state` garantiza que eso es inocuo ("Cerrar sesión sin sesión abierta es inocuo"), así que no hace falta ninguna excepción por ruta. Queda anotado para CHANGE-16.

### D-9 — Los campos numéricos usan `Input type="number"` con `setValueAs`, no `valueAsNumber`

```ts
const asOptionalNumber = (value: string) => (value === '' ? undefined : Number(value))
register('sqlmap_level', { setValueAs: asOptionalNumber })
```

*El problema heredado* (nota de traspaso de CHANGE-17, su D-6 y R-3): un `<input type="number">` entrega un **string**, y `scanSchema` no coacciona → el campo nunca valida.

*Por qué no `valueAsNumber: true`*, que es la respuesta obvia: con el campo **vacío** produce `NaN`, y `z.number()` rechaza `NaN` con un issue `invalid_type` cuyo mensaje por defecto está **en inglés** ("Expected number, received nan"). Sería exactamente el texto que D-12 de CHANGE-17 se ocupó de eliminar del formulario, apareciendo por la puerta de atrás. Con `setValueAs`, el campo vacío se convierte en "campo omitido" → el `.default(1)` del schema lo completa, que es literalmente el escenario "los campos omitidos toman el valor por defecto" de `scan-form-contracts`.

*Por qué no un `<select>` de 1..5 / 1..3*, que también resolvería el tipo y haría imposible el fuera de rango: `shared/ui` no tiene primitivo `Select` y `tests/structure.test.ts` afirma que contiene **exactamente** los cinco primitivos de CHANGE-15. Agregar uno abre `shared-ui-kit`, su spec y su suite — un change de UI kit para dos campos. El `Input type="number"` con `min`/`max`/`step` tomados de las constantes que exporta `@entities/scan` cubre el caso; el schema sigue siendo la red por debajo para el valor tipeado a mano fuera de rango (D-5 de CHANGE-17), que era la premisa de esa decisión.

*Los límites salen de las constantes*, no de literales: un control que ofrece un rango distinto del que el contrato acepta le muestra al usuario un valor que después se rechaza.

### D-10 — `useForm` con el tercer parámetro de tipo, para que `handleSubmit` reciba la salida **ya parseada**

```ts
useForm<ScanForm, unknown, z.output<typeof scanSchema>>({
  resolver: zodResolver(scanSchema),
  defaultValues: { target_url: '', phpsessid: '', sqlmap_level: SQLMAP_LEVEL_DEFAULT, sqlmap_risk: SQLMAP_RISK_DEFAULT, ethical_consent: false },
})
```

`ScanForm` (con `ethical_consent: boolean` y los numéricos opcionales) es lo que los controles manejan; la salida del schema (con `ethical_consent: true` y los numéricos ya completos) es lo que llega al `onSubmit`. De ahí el cuerpo a despachar sale quitando `ethical_consent`, y `ScanRequest` —que por tipo no admite ese campo (D-7 de CHANGE-17)— es lo que impide mandarlo por error.

*Por qué los defaults también en `defaultValues`*: el `.default()` del schema actúa al **parsear**; el control necesita un valor inicial al **renderizar**. Los dos salen de la misma constante exportada, así que no pueden separarse.

### D-11 — La redirección espera a que el usuario vea la confirmación, y se cancela al desmontar

`SUCCESS_REDIRECT_DELAY_MS = 2000`, un `setTimeout` con `clearTimeout` en el cleanup del efecto, y `window.location.href = dashboardUrl` (de `@shared/config/env`).

*Por qué el retraso*: HU-05-01 pide "mensaje de éxito ~2s" antes de redirigir. Redirigir de inmediato hace que la pantalla cambie sin explicación aparente.

*Por qué en un efecto con cleanup y no en el `catch`/`then` del submit*: un `setTimeout` disparado dentro del handler sigue vivo después de desmontar el componente y navega igual — el escenario "desmontaje antes de la navegación" del spec.

*Nota de testing*: jsdom no implementa la navegación; asignar `window.location.href` emite un "Not implemented: navigation". Los tests sustituyen `window.location` por un objeto propio (patrón estándar en jsdom) y afirman sobre su `href`. Se prefiere esto a introducir un módulo `navigate()` en `shared/` solo para poder espiarlo: sería una indirección que existe únicamente para el test.

### D-12 — Los mensajes son una tabla de constantes exportadas, indexada por código de estado

Un mapa `status → mensaje` más un mensaje de red y uno genérico, exportados por nombre para que los tests afirmen sobre la constante y no repitan el literal (mismo criterio que D-12 de CHANGE-17). Los textos salen del §Casos de error del Flujo 3 de la KB y de HU-05-03, en español y con el mismo voseo que el resto de la aplicación.

`400` y `422` comparten mensaje: para el usuario son el mismo hecho (el Bridge no aceptó los datos), y la distinción entre "JSON no parseable" y "viola el schema" es del `error-rendering` del backend, no de la pantalla.

*Por qué no mostrar el `detail` del Bridge tal cual*: viene en un registro pensado para quien depura, puede nombrar campos internos, y en el `422` describe el error de Pydantic. El cliente ya valida todo lo que valida el Bridge, con paridad verificada (CHANGE-17): un `422` significa que cliente y Bridge se desincronizaron, no que el usuario tipeó algo corregible. Mensaje propio y estable.

*Por qué el `429` no dice cuántos minutos faltan* (lo pide HU-05-03 y el Flujo 3): el `Retry-After` que el Bridge emite **no es legible por el navegador**. `CORSMiddleware` se configura en `fastapi_bridge/main.py` sin `expose_headers`, y `Retry-After` no está en la lista blanca de CORS. Leerlo requiere un cambio en el Bridge, que está fuera del scope de este change. El mensaje dice que se alcanzó el límite y que hay que esperar, sin inventar un número. Ver R-1.

### D-13 — Los tests de estructura se **actualizan**, no se relajan

`tests/structure.test.ts` afirma hoy que `src/shared/api/` y `src/features/` contienen únicamente `.gitkeep`. Esas aserciones pasan a listar los módulos concretos que este change crea, en el mismo formato que los bloques de `entities/user` y `entities/scan` (D-9 de CHANGE-17). El guard entre slices de `tests/scan-schema.test.ts` se retira: con D-4 no queda nada que pueda divergir, y dejarlo daría a entender que sigue habiendo dos declaraciones.

*Por qué no aflojarlas a un `toContain`*: fueron escritas para que cada pieza aparezca en el change que la implementa. Un `toContain` deja de detectar el archivo que alguien agregue sin querer.

## Risks / Trade-offs

- **R-1 — El `429` no puede decir cuánto falta** → El `Retry-After` no está expuesto por CORS (D-12). Mitigación: mensaje sin número, correcto aunque incompleto. La corrección de fondo es del **Bridge** (`expose_headers=["Retry-After"]` en su `CORSMiddleware`), no del cliente; queda como nota para un change de backend. Se prefiere esto a estimar minutos a partir de la ventana configurada, que sería un número inventado del lado equivocado.
- **R-2 — Este change modifica `entities/user`, fuera de su scope literal** → Es una línea (`export type AuthApiError = ProblemDetails`) más su import, con los mismos nombres exportados. El riesgo real es de coordinación con CHANGE-16, que todavía no existe: al no existir, no hay nada que romper, y nacerá consumiendo ya el contrato unificado.
- **R-3 — El interceptor global cierra sesión ante cualquier `401`, incluido el de un login fallido de CHANGE-16** → `logout()` sobre una sesión inexistente es inocuo por spec (`auth-session-state`). Queda anotado en D-8; si CHANGE-16 necesitara excluir su ruta, el punto donde hacerlo es el interceptor y no el formulario.
- **R-4 — La navegación en jsdom obliga a sustituir `window.location`** → Patrón conocido y acotado a los tests que la ejercitan (D-11). La alternativa (un módulo `navigate()` en `shared/`) agrega indirección de producción para comodidad de test.
- **R-5 — `setValueAs` es menos conocido que `valueAsNumber` y alguien puede "corregirlo"** → Cubierto por un test que envía el campo numérico **vacío** y afirma que toma el valor por defecto sin mensaje de tipo inválido: con `valueAsNumber` ese test falla en inglés. El porqué queda en un comentario al lado del `register`.
- **R-6 — El cliente HTTP se vuelve un punto único de fallo del frontend** → Es el objetivo (un solo canal), y el precio es que un bug ahí afecta a todos los dominios. Se acota con tests propios de la capa (`http-client`), independientes del formulario.
- **R-7 — Sin cancelación de la solicitud en vuelo** → Si el usuario desmonta el formulario con una solicitud viva, la respuesta llega a un componente muerto. Se mitiga con el cleanup del efecto de redirección (D-11); el `setState` posterior al desmontaje no rompe en React 19, solo se descarta. Un `AbortController` sería lo correcto si en el futuro el formulario pudiera desmontarse a media petición (CHANGE-19 lo monta detrás del muro de autenticación, donde eso puede pasar si el `401` lo desmonta).
- **Trade-off aceptado** — `shared/api/axiosInstance.ts` con estado de módulo (las dos referencias inyectadas) no es una función pura. Es el precio de mantener la dirección de capas sin que cada llamador adjunte la credencial a mano; el estado es de dos referencias, se asigna desde un único lugar y es idempotente por construcción (D-2).

## Open Questions

Ninguna bloquea el `apply`.

1. **El retraso de 2 s antes de redirigir** (D-11): la KB (HU-05-01) pide "mensaje de éxito ~2s", y el criterio de aceptación del roadmap solo dice "redirección a `VITE_DASHBOARD_URL`". Se implementa con el retraso, por la KB. Si se prefiere redirigir de inmediato, es cambiar una constante.
2. **"Spinner si tarda >10s"** (HU-05-01): se interpreta como cubierto por el estado de carga que ya se muestra durante **toda** la solicitud —un superconjunto de "después de 10 s"—, y no se agrega un temporizador aparte. Si lo que se quería era un mensaje distinto pasados 10 s ("esto está tardando más de lo normal"), es un agregado posterior que no cambia specs ni tareas.
3. **Exponer `Retry-After` en el Bridge** (R-1): decisión de un change de backend. Si se hace, el mensaje del `429` puede volverse específico sin tocar nada más que la constante y el lugar donde se lee el header.
