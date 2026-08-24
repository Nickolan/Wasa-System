## Context

**Governance: BAJO (LOW)** — `CHANGES.md` clasifica CHANGE-17 como BAJO: tipos y schemas de validación, sin I/O, sin UI, sin estado. Plena autonomía si los tests pasan. Las decisiones de abajo se documentan para que queden auditables, no porque bloqueen el `apply`. Tres de ellas (D-1, D-3, D-5) **se desvían de la letra del roadmap** y merecen una lectura antes de implementar.

### Estado real del repo, verificado antes de diseñar

- El frontend vive en `wasa-landing/` (Vite 8 + React 19 + TS + Tailwind 4). `src/entities/` contiene hoy **una sola slice, `user`** (CHANGE-14). Este change agrega la segunda.
- **La slice de auth se llama `entities/user`, no `entities/auth`.** El contrato de referencia para el estilo de este change es `src/entities/user/` y el change archivado `openspec/changes/archive/2026-08-23-auth-zod-schemas/`.
- `zod@3.25.76` ya está instalado. La versión importa: es la API clásica de **Zod v3** (`z.string().url()`, `z.literal(v, params)`, `errorMap`), no la de v4.
- Test runner **Vitest 4** (`npm test` / `npm run test:run`), `environment: 'jsdom'`, `globals: true`, `include: ['tests/**/*.test.{ts,tsx}']`. Los tests viven en `wasa-landing/tests/`, fuera de `src/`.
- Ya existen los helpers de test que este change reutiliza: `tests/support/zod.ts` (`expectZodError`, `issuePaths`) y `tests/support/pythonConstants.ts` (lectura de constantes del backend para los tests de paridad).
- `tests/fsd-boundaries.test.ts` verifica automáticamente la dirección de las capas; los módulos nuevos quedan cubiertos sin agregar nada.
- `tests/structure.test.ts` afirma hoy, en el bloque de CHANGE-14 (D-9), que `readdirSync('src/entities')` es **exactamente `['user']`**. Esa aserción caduca con este change (ver D-9).
- El contrato del backend ya está implementado y archivado: `fastapi_bridge/schemas/scan_schemas.py` (CHANGE-08) y `fastapi_bridge/schemas/error_schemas.py` (CHANGE-02). El endpoint es `POST /api/v1/scan/start` y responde **202 Accepted** (`fastapi_bridge/api/v1/scan/router.py`).

### El contrato del Bridge, tal como está hoy en el código

| Backend (`scan_schemas.py`) | Regla |
|---|---|
| `ScanRequest.target_url` | `HttpUrl` — solo `http`/`https`, y **normaliza** (`https://example.com` → `https://example.com/`) |
| `ScanRequest.phpsessid` | `StringConstraints(strip_whitespace=True, min_length=1)` — recorta **antes** de medir |
| `ScanRequest.sqlmap_level` | `Annotated[int, Field(ge=1, le=5)] = 1` |
| `ScanRequest.sqlmap_risk` | `Annotated[int, Field(ge=1, le=3)] = 1` |
| `ScanRequest.model_config` | `extra="ignore"` — el checkbox ético del formulario se descarta sin romper la solicitud (D-7 de CHANGE-08) |
| `ScanResponse` | `scan_id: str`, `status: Literal["queued"]`, `message: str` |
| `ErrorDetail` | `type` (default `"about:blank"`), `title`, `status` (100..599), `detail: str \| None = None`, `instance` |

**RN-WS-01 (declaración ética) no tiene contraparte en el backend y no debe tenerla**: es una condición de la interfaz. El Bridge la descarta con `extra="ignore"`. Este change es el único lugar del sistema donde esa regla se codifica.

### Comportamientos de Zod v3 verificados empíricamente contra la versión instalada

El diseño depende de estos cuatro, y los cuatro se probaron ejecutando `zod@3.25.76`, no leyendo la documentación:

1. **`z.string().min(1).trim()` acepta `"   "`** y devuelve `""`. `.trim()` es una transformación que se aplica **en el orden de la cadena**: escrito así, `min(1)` mide los 3 espacios, pasa, y recién después se recorta. `z.string().trim().min(1)` sí rechaza. La escritura literal del roadmap (`min(1).trim()`) viola RN-WS-03. → D-3.
2. **`z.string().url()` acepta `ftp://example.com`, `file:///etc/passwd` y `javascript:alert(1)`**. Está implementado como `new URL(value)` en un `try/catch`, sin restricción de esquema. Por sí solo viola RN-WS-02. → D-1.
3. **`z.literal(true, { message: '...' })` ignora el mensaje**: el fallo produce un issue `invalid_literal`, al que `message` / `invalid_type_error` / `required_error` no llegan; sale el texto por defecto en inglés (`"Invalid literal value, expected true"`). Solo `errorMap` lo reemplaza, y lo hace tanto para `false` como para el campo ausente. El roadmap ya pedía `errorMap`; acá queda registrado **por qué es obligatorio y no una preferencia**. → D-4.
4. **Un `.refine()` de campo se ejecuta SIEMPRE, aunque un check builtin anterior del mismo campo haya fallado.** Verificado con `min`, `max`, `url` y `email`: en los cuatro casos el `ZodError` trae los dos issues. → D-1, y ver la nota de corrección al final de esta sección.

> **Corrección a un dato del design de CHANGE-14.** Aquel documento afirma, en su lista de comportamientos verificados, que "un `.refine` de campo sí se saltea si el check anterior de ese mismo campo falló". **Es incorrecto**: el `.refine` corre igual. La observación original se explica porque en aquel caso el refine de bytes *pasaba* para una contraseña corta (7 caracteres son 7 bytes ≤ 72), no porque se salteara. El comportamiento de `entities/user` no cambia —sigue emitiendo un solo issue por campo por la razón de arriba— así que **no hay nada que corregir en el código de CHANGE-14**; queda anotado acá para que nadie diseñe apoyándose en un salteo que no existe.

Otros dos comportamientos, ya verificados en CHANGE-14 y reconfirmados acá: un objeto Zod **descarta** las claves desconocidas en la salida de `parse` sin reportar error, y el `ZodError` de un objeto con varios campos inválidos trae **un issue por campo**, no solo el primero.

## Goals / Non-Goals

**Goals:**

- Fijar la forma de los datos del escaneo del cliente en un único lugar, antes de que exista el formulario que los use (CHANGE-18).
- Replicar exactamente el contrato de solicitud del Bridge —esquemas aceptados, obligatoriedad de la sesión, rangos y defaults de SQLMap— y dejar esa paridad verificada por un test, no por un comentario.
- Codificar RN-WS-01 (declaración ética), la única regla del formulario que el backend deliberadamente no valida.
- Impedir **por tipos** que la aceptación ética llegue al Bridge como parte del cuerpo.
- Mantener `entities/scan` como modelo puro: sin React, sin red, sin `localStorage`, ejecutable fuera del navegador.

**Non-Goals:**

- El componente de formulario, `react-hook-form`, `zodResolver`, tooltips, estado de carga (CHANGE-18).
- El cliente HTTP, el interceptor de `Authorization`, el manejo de 401/429/502 y la redirección al Dashboard (CHANGE-18/19).
- Validar en runtime la respuesta del Bridge: `ScanResponse` y `ScanApiError` son **tipos**, no schemas de parseo (mismo criterio que D-10 de CHANGE-14).
- Normalizar la URL objetivo al estilo de `HttpUrl` (ver D-2).
- Unificar `ScanApiError` con el `AuthApiError` de `entities/user` (ver D-8).
- Validar que la URL objetivo apunte a un objetivo autorizado: eso no es una regla de formato y el sistema no lo hace en ninguna capa.

## Decisions

### D-1 — `target_url` se valida con **un solo** `refine` que subsume `url()` y restringe el esquema

```ts
const isHttpUrl = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

target_url: z.string().trim().refine(isHttpUrl, { message: TARGET_URL_MESSAGE })
```

*Por qué no basta `z.string().url()`*: acepta `ftp://`, `file:///etc/passwd` y `javascript:alert(1)` (comportamiento 2 de arriba). RN-WS-02 y el `HttpUrl` del Bridge exigen `http`/`https`. Dejarlo así significa que el campo acepta una `javascript:` URL — un valor que no tiene ningún sentido en el formulario y que, en cuanto CHANGE-18 lo renderice o lo ponga en un `href` en algún punto, deja de ser solo un problema de validación.

*Por qué un solo `refine` y no `url().refine(protocolo)`*: porque el `.refine` corre igual aunque `.url()` haya fallado (comportamiento 4). Con la cadena `url().refine()`, un `target_url` de `"not-a-url"` produce **dos issues sobre el mismo campo con el mismo mensaje** — verificado. El `refine` único produce exactamente un issue en todos los casos de fallo.

*Verificado que es equivalente a `url()` salvo donde queremos que difiera*: se compararon las dos formas sobre `https://a.com`, `http://dvwa.local/x.php?a=1`, `"  https://a.com  "`, `example.com`, `not-a-url`, `""`, `//example.com`, `https://`, `ftp://e.com`, `file:///etc/passwd` y `javascript:alert(1)`. Coinciden en todos **excepto** en los tres esquemas prohibidos, que es exactamente la diferencia buscada. `z.string().url()` de Zod v3 está implementado con `new URL()` en un `try/catch`, así que la equivalencia no es una coincidencia.

*Desviación del roadmap, deliberada*: `CHANGES.md` escribe "`target_url` url() con mensaje custom". Se conserva el mensaje custom y se conserva el efecto de `url()`; lo que no se conserva es la llamada literal a `.url()`, porque encadenarla duplica el issue y no cubre la regla.

### D-2 — La URL objetivo se recorta, pero **no** se normaliza

`z.string().trim()` antes del refine. Nada más: `https://example.com` sale como `https://example.com`, no como `https://example.com/`.

*Por qué `trim`*: una URL se pega desde la barra del navegador y viene con espacios con frecuencia. El Bridge la aceptaría igual (`HttpUrl` tolera el espacio en el borde en la mayoría de los casos, y el `.strip()` no le haría falta); rechazarla acá por "URL inválida" sería un error que el usuario no puede ver ni entender.

*Por qué NO normalizar*: `HttpUrl` del Bridge sí normaliza, y `scan-payload-contract` exige que esa normalización sea determinística — **del lado del Bridge**. Replicarla acá con `new URL(v).toString()` duplicaría la responsabilidad y alteraría en silencio lo que el usuario escribió, sin ganar nada: el valor que llega al orquestador es el que normaliza el Bridge, no el que envía el cliente. El cliente valida; el Bridge normaliza.

### D-3 — `phpsessid` recorta **antes** de medir: `trim().min(1)`, no `min(1).trim()`

```ts
phpsessid: z.string().trim().min(1, { message: PHPSESSID_MESSAGE })
```

*Por qué*: escrito al revés (la letra del roadmap), `"   "` **pasa** la validación y sale como `""` — verificado. RN-WS-03 dice explícitamente "no se acepta cadena vacía ni solo espacios en blanco", y el Bridge aplica `strip_whitespace=True` junto con `min_length=1` (Pydantic recorta primero). El orden de la cadena Zod no es cosmético: es la diferencia entre cumplir la regla y no cumplirla.

*Desviación del roadmap, deliberada*: `CHANGES.md` escribe "`phpsessid` min(1).trim()". Se invierte el orden. Es el mismo orden que ya usa `entities/user` para el email (`z.string().trim().email(...)`, D-11 de CHANGE-14).

### D-4 — `ethical_consent` es `z.literal(true)` con `errorMap`, no con `message`

```ts
ethical_consent: z.literal(true, {
  errorMap: () => ({ message: ETHICAL_CONSENT_MESSAGE }),
})
```

*Por qué `errorMap` y no `{ message }`*: un `message` simple **no llega** al issue `invalid_literal` que produce `z.literal` (comportamiento 3, verificado): el usuario vería `"Invalid literal value, expected true"` en inglés, en un formulario que está en español. `errorMap` es el único mecanismo que reemplaza ese texto.

*Por qué `z.literal(true)` y no `z.boolean().refine(v => v)`*: con `literal`, el tipo de salida es `true`, no `boolean` — el sistema de tipos deja constancia de que un escaneo validado **tiene** el consentimiento dado, y no solo un booleano que alguien tendrá que volver a chequear. Con `refine`, la salida sería `boolean` y esa garantía se perdería en la primera firma que la reciba.

*El mismo mensaje cubre "sin marcar" y "ausente"*: verificado que `errorMap` se aplica a los dos casos (`false` y `undefined`), y son el mismo problema para quien usa el formulario. No se distinguen.

### D-5 — Los parámetros de SQLMap se **rechazan** fuera de rango; no se recortan al rango

`z.number().int().min(1).max(5).default(1)` y `z.number().int().min(1).max(3).default(1)`.

*La KB se contradice y esta decisión la resuelve*: HU-02-04 lista entre sus criterios de aceptación "clamping a rango", mientras que RN-WS-04/05 y la capability `scan-payload-contract` del Bridge dicen lo contrario y de forma explícita: *"el contrato NO recorta ni ajusta el valor al rango, lo rechaza"*.

*Se resuelve a favor del rechazo*, por tres razones: (a) el Bridge es la autoridad y rechaza — un cliente que recorta produce una divergencia silenciosa entre lo que el usuario pidió y lo que se ejecuta; (b) recortar un parámetro de agresividad de una herramienta de seguridad **sin decírselo al usuario** es el peor de los dos comportamientos: alguien que pide `risk=5` obtendría un escaneo de `risk=3` creyendo que pidió otra cosa; (c) el "clamping" de HU-02-04 se interpreta como una propiedad del **control de la interfaz** (un `<select>` de 1..5, o un `<input type="number" min max>`, que no puede producir un valor fuera de rango), no del schema — y eso es una decisión de CHANGE-18, no de este change. El schema sigue siendo la red que atrapa lo que el control no impida.

*Los defaults viven en el schema, no en la capa de formulario* (lo pide el scope del roadmap y es lo correcto): `defaultValues` de `react-hook-form` es un detalle de una interfaz concreta; cualquier otro consumidor del contrato —el test de paridad, un futuro cliente— obtiene los mismos valores sin depender de cómo se construyó el formulario. Es además paridad literal con el `= 1` del Bridge.

### D-6 — Sin coerción de tipos: `z.number()`, no `z.coerce.number()`

*Por qué*: un `<input type="number">` entrega un **string** a `react-hook-form` salvo que se lo registre con `valueAsNumber: true`. La tentación es resolverlo en el schema con `z.coerce.number()`. Se descarta:

- `z.coerce.number().parse('')` devuelve **`0`** (verificado). Un campo numérico vacío pasaría de "no lo completé" a "pedí 0", y el error resultante sería `too_small` ("debe ser al menos 1") en vez de "es obligatorio" — un mensaje que no describe lo que pasó.
- `z.coerce.number()` también acepta `true` (→ 1), `null` (→ 0) y `"  3 "` (→ 3), ensanchando el contrato bastante más allá de lo que acepta el `int` del Bridge.
- `z.number().int()` rechaza `"3"`, `2.5` y `"alto"` (verificado), que es exactamente lo que exige `scan-payload-contract`.

*Consecuencia para CHANGE-18*: el formulario **debe** registrar los dos campos numéricos con `valueAsNumber: true` (o usar un `<select>` con valores numéricos). Queda anotado como nota de traspaso, no como una limitación oculta.

### D-7 — Cuatro tipos: la forma del formulario y la forma del cable son distintas

`model/types.ts` declara a mano:

```ts
export interface ScanForm {
  target_url: string
  phpsessid: string
  sqlmap_level?: number
  sqlmap_risk?: number
  ethical_consent: boolean
}

export interface ScanRequest {
  target_url: string
  phpsessid: string
  sqlmap_level: number
  sqlmap_risk: number
}

export interface ScanResponse { scan_id: string; status: 'queued'; message: string }

export interface ScanApiError {
  type: string
  title: string
  status: number
  detail: string | null
  instance: string
}
```

Tres asimetrías, todas deliberadas:

- **`ethical_consent` está en `ScanForm` y no en `ScanRequest`.** Es RN-WS-01, una condición de la interfaz; el Bridge la descarta (`extra="ignore"`). `ScanRequest` es el espejo exacto del `ScanRequest` Pydantic, y el tipo es lo que impide que CHANGE-18 componga un cuerpo con el checkbox adentro. Es el mismo patrón que `UserRegister` / `UserRegisterRequest` en `entities/user`.
- **`sqlmap_level` / `sqlmap_risk` son opcionales en `ScanForm` y obligatorios en `ScanRequest`.** Por `.default(1)`: el formulario puede no traerlos, la salida validada siempre los tiene. Son literalmente el tipo de entrada y el de salida del mismo schema.
- **`ethical_consent` es `boolean` en `ScanForm`, aunque el schema solo acepte `true`.** El checkbox **empieza sin marcar**: `false` tiene que ser un estado representable del formulario, o el usuario no puede llegar a ver el mensaje de RN-WS-01. Por eso `ScanForm` no puede ser `z.input<typeof scanSchema>` (que es `true`): el tipo del formulario es más ancho que el de la entrada válida, a propósito.

*Nombres del cable sin renombrar*: `target_url`, `phpsessid`, `sqlmap_level`, `sqlmap_risk`, `scan_id`, `status`, `message` conservan el `snake_case` con que viajan, igual que en `entities/user` (D-10 de CHANGE-14). Un renombrado a `camelCase` convertiría un contrato verificable en una traducción que nadie ejercita hasta que rompe en runtime.

*Guards de tipo, en `scanSchema.ts`*: dos aserciones exportadas **como tipos** (no como `const`: `noUnusedLocals` está activo), que fallan en compilación si el schema y los tipos se separan:

```ts
type Assert<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export type _ScanRequestMatchesOutput =
  Assert<Equals<Omit<z.output<typeof scanSchema>, 'ethical_consent'>, ScanRequest>>
export type _ScanFormMatchesInput =
  Assert<Equals<Omit<z.input<typeof scanSchema>, 'ethical_consent'>, Omit<ScanForm, 'ethical_consent'>>>
```

La rama negativa de `Equals` resuelve a **`false`, nunca a `never`** — `never` satisface trivialmente `T extends true` y dejaría pasar cualquier divergencia sin error. Esto está verificado empíricamente en CHANGE-14 (ver la nota de su tarea 5.2) y no se vuelve a discutir acá: se copia la forma corregida.

El campo `ethical_consent` se excluye de ambos guards porque su tipo diverge a propósito (`true` en el schema, `boolean` en el formulario) y se cubre con una aserción propia de compatibilidad más un test de runtime.

### D-8 — `ScanApiError` se declara en la slice, duplicando la forma de `AuthApiError`

`entities/scan/model/types.ts` declara `ScanApiError` con los cinco miembros de RFC 7807, idéntico al `AuthApiError` que ya declara `entities/user`.

*Por qué duplicar y no compartir*: en FSD las slices de una misma capa **no se importan entre sí**. `entities/scan` no puede importar de `entities/user` sin romper la regla que `tests/fsd-boundaries.test.ts` verifica.

*Por qué no moverlo a `shared/`*: sería lo correcto a largo plazo, y es exactamente lo que hizo el backend con `error_schemas.py` (D-10 de CHANGE-02: un contrato transversal no vive en el módulo de un dominio). Pero (a) `shared/api/` es territorio de CHANGE-18 (`axiosInstance.ts`) y hoy `tests/structure.test.ts` afirma que contiene solo `.gitkeep`; (b) obligaría a tocar `entities/user`, fuera del alcance de este change; y (c) el punto donde ese tipo se usa de verdad —el cliente HTTP que traduce un error del Bridge a un mensaje— es CHANGE-18. **Unificar allá es más barato y más informado que unificar acá a ciegas.**

*Mitigación del riesgo de divergencia, hoy*: un test en `tests/` (que sí puede importar de ambas slices, porque está fuera del grafo de capas) afirma a nivel de tipos que `ScanApiError` y `AuthApiError` son la misma forma. Si alguien cambia una sola, `tsc` falla. El costo de la duplicación queda acotado a "dos declaraciones", sin el riesgo de "dos declaraciones que se separan en silencio".

### D-9 — `tests/structure.test.ts` se actualiza, no se relaja

La aserción `expect(readdirSync('src/entities')).toEqual(['user'])` pasa a `['scan', 'user']`, y se agrega un bloque que lista los módulos esperados de `entities/scan/` (`index.ts`, `model/scanSchema.ts`, `model/types.ts`), en el mismo formato que el bloque de `entities/user`.

*Por qué actualizar en vez de aflojar la aserción*: fue escrita en CHANGE-14 (D-9) justamente para que cada pieza de dominio aparezca en el change que la implementa. Cambiarla por algo como `toContain('scan')` dejaría de detectar la slice que alguien agregue sin darse cuenta. Con la lista concreta, el próximo archivo que se sume a la capa es una decisión visible.

### D-10 — La paridad con el Bridge se verifica leyendo `scan_schemas.py`, no repitiendo los números

`tests/scan-schemas-parity.test.ts` lee `../fastapi_bridge/schemas/scan_schemas.py` (mismo repo, ruta relativa a `wasa-landing/`), extrae por expresión regular los límites y el default de cada parámetro de las líneas `sqlmap_level: Annotated[int, Field(ge=1, le=5)] = 1` y `sqlmap_risk: Annotated[int, Field(ge=1, le=3)] = 1`, y los compara con las constantes que exporta el frontend. Verifica además la presencia de `strip_whitespace=True` y `min_length=1` en `phpsessid`, de `extra="ignore"` en el `model_config`, y de `Literal["queued"]` en `ScanResponse.status`.

*Por qué*: es el único mecanismo que hace fallar el cambio **unilateral** del contrato. Un `expect(SQLMAP_LEVEL_MAX).toBe(5)` solo repite el literal una tercera vez: si el backend sube el máximo, el frontend sigue verde y desincronizado. Es el mismo mecanismo y la misma razón que `tests/auth-schemas-parity.test.ts` (D-7 de CHANGE-14), reutilizando `tests/support/pythonConstants.ts`.

*Modo de fallo elegido*: si el archivo no existe o la expresión regular no encuentra el dato, el test **falla nombrando el dato que no pudo leer**, en vez de saltearse. Un chequeo de paridad que se auto-desactiva cuando el backend se reformatea es peor que no tenerlo.

*Trade-off asumido*: el test se acopla a la **forma textual** de dos líneas del backend, no solo a dos nombres. Es más frágil que el caso de auth (donde los valores estaban en constantes con nombre). Se acepta a conciencia: el modo de fallo es ruidoso y local a un test, y la alternativa —no verificar— es la que produce el bug silencioso. Si el backend reformatea esas anotaciones, este test es el recordatorio de revisar la paridad.

### D-11 — Las constantes de rango viven en `scanSchema.ts`, no en un módulo aparte

`SQLMAP_LEVEL_MIN/MAX`, `SQLMAP_RISK_MIN/MAX`, `SQLMAP_LEVEL_DEFAULT`, `SQLMAP_RISK_DEFAULT` se exportan desde `model/scanSchema.ts` y se re-exportan por `index.ts`.

*Por qué no un `sqlmapRanges.ts` al estilo de `passwordRules.ts`*: aquel módulo existe porque **dos** schemas comparten la política (D-2 de CHANGE-14). Acá hay un solo schema. Un módulo de tres líneas para constantes de un único consumidor agrega un archivo sin quitar ninguna duplicación. Se exportan igual —en vez de dejarlas como literales inline— porque el test de paridad (D-10) y el formulario de CHANGE-18 (que necesita los rangos para el `min`/`max` del control) las necesitan por nombre.

*Por qué no en `types.ts`*: la regla del proyecto reserva `types.ts` para tipos, sin runtime.

### D-12 — Los mensajes de validación se escriben en español, como constantes exportadas

| Campo | Mensaje |
|---|---|
| `target_url` | `'Ingresá una URL válida que empiece con http:// o https://.'` |
| `phpsessid` | `'PHPSESSID requerido.'` |
| `sqlmap_level` | `'El nivel debe ser un número entero entre 1 y 5.'` |
| `sqlmap_risk` | `'El riesgo debe ser un número entero entre 1 y 3.'` |
| `ethical_consent` | `'Tenés que aceptar la declaración ética para iniciar el escaneo.'` |

*Por qué en español y explícitos*: los mensajes por defecto de Zod están en inglés y se mostrarían tal cual bajo el campo en CHANGE-18, junto a los que la KB ya fija en español. Es la misma decisión que D-12 de CHANGE-14, y el mismo registro de voz (voseo: "Ingresá", "Tenés", igual que "Ingresá un email válido." e "Ingresá tu contraseña." que ya están en `entities/user`).

*El de `phpsessid` es literal de la KB*: HU-02-03 fija el texto `"PHPSESSID requerido"`. Se conserva textual y solo se le agrega el punto final, por consistencia con el resto.

*El de `target_url` nombra los dos esquemas aceptados* en lugar de decir solo "URL inválida": el fallo más probable es escribir `example.com` sin esquema, y un mensaje que dice qué falta se corrige en un intento.

*Se exportan como constantes* (no inline en el schema) para que los tests puedan afirmar el mensaje sin repetir el literal, y para que CHANGE-18 pueda mostrarlo sin duplicarlo.

## Risks / Trade-offs

- **R-1 — El test de paridad se rompe si el backend reformatea `scan_schemas.py`** → Falla ruidosamente nombrando el dato que no encontró (D-10). Es el modo de fallo deseado, pero es más frágil que el equivalente de auth porque se acopla a la forma de la anotación, no a un nombre de constante. Si molesta en la práctica, la corrección correcta es que el **backend** extraiga esos números a constantes con nombre, no que el frontend deje de verificarlos.
- **R-2 — `ScanApiError` y `AuthApiError` divergen** → Guard de tipo entre slices en `tests/` (D-8), pero `tsconfig.app.json` solo incluye `src/` y ni `npm run build` ni `npm run test:run` compilan `tests/` — el guard NO falla en CI ni en build; solo se ve como error si alguien abre ese archivo en un editor con el language server de TS activo (verificado empíricamente: cambiar `ScanApiError.status` a `string` pasa build y tests sin aviso). Es documentación ejecutable, no un enforcement real. La unificación real queda planificada para CHANGE-18.
- **R-3 — CHANGE-18 olvida `valueAsNumber` y todo el formulario falla en los dos campos numéricos** → El síntoma es ruidoso e inmediato (el campo no valida nunca), no silencioso. Queda anotado como nota de traspaso en D-6 y en la tarea final. La alternativa (`z.coerce`) cambia un fallo ruidoso por un `0` silencioso.
- **R-4 — El rechazo sin clamping se percibe como más hostil que el recorte** → Es la decisión explícita de D-5 y la del Bridge. Un control de interfaz que no pueda producir valores fuera de rango (CHANGE-18) hace que el usuario nunca vea este error; el schema sigue siendo la red por debajo.
- **R-5 — `ScanResponse` y `ScanApiError` se creen verificados y no lo están** → Son tipos: si el Bridge cambiara la forma de la respuesta, TypeScript no lo notaría. Mitigación parcial: el test de paridad verifica que `ScanResponse.status` sigue siendo `Literal["queued"]` en el backend (D-10). El parseo real, si se decide hacerlo, es de CHANGE-18.
- **R-6 — La URL objetivo valida el formato, no el permiso** → Ninguna capa del sistema verifica que el objetivo esté autorizado a ser escaneado; por eso existe RN-WS-01. Este change no cambia eso, y no debería: es lo que la declaración ética cubre.
- **Trade-off aceptado** — este change no produce nada visible: no hay formulario que ejecute este schema hasta CHANGE-18. Se acepta por la misma razón que en CHANGE-14: definir el contrato antes del primer consumidor cuesta menos que reconstruirlo después de tenerlo.

## Open Questions

Ninguna bloquea el `apply`.

1. **(resuelta en este change, anotada por si el usuario discrepa)** HU-02-04 dice "clamping a rango" y RN-WS-04/05 dicen rechazo. Se implementa **rechazo**, alineado con el Bridge (D-5). Si el usuario prefiere clamping, el cambio es de una línea por campo en el schema — pero rompería la paridad con `scan-payload-contract`.
2. **(para CHANGE-18)** ¿La unificación de `ScanApiError` y `AuthApiError` en un `ProblemDetails` de `shared/api/` se hace al crear `axiosInstance.ts`? Este change la deja preparada y verificada por tipos, sin ejecutarla (D-8).
3. **(para CHANGE-18)** ¿Los parámetros de SQLMap se renderizan como `<select>` de valores fijos o como `<input type="number">` con `min`/`max`? Cualquiera de las dos satisface D-5; la primera hace que el usuario nunca llegue a ver el mensaje de rango.
