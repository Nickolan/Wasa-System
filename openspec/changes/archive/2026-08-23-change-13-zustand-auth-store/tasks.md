# Tasks — change-13-zustand-auth-store

> Strict TDD activo. Cada grupo 4..12 es un ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR**:
> el test se escribe y se ejecuta *antes* que el código de producción que lo satisface.
> Referencias: `specs/jwt-expiry-inspection/spec.md` y `specs/auth-session-state/spec.md` (qué),
> `design.md` D-1..D-14 (cómo).
>
> **PRECONDICIÓN BLOQUEANTE (governance ALTO)**: el grupo 1 debe cerrarse con confirmación
> explícita del usuario sobre **D-1 a D-6** antes de escribir una sola línea. Este change escribe
> credenciales en el navegador del usuario; no aplica la excepción MEDIUM de CHANGE-01..07.
>
> **Archivos de producción que este change toca (y ningún otro)**:
> `wasa-landing/src/shared/lib/utils.ts` (nuevo), `wasa-landing/src/app/stores/authStore.ts` (nuevo),
> `wasa-landing/src/app/App.tsx` (se agrega un `useEffect`), y el borrado de
> `wasa-landing/src/app/stores/.gitkeep` y `wasa-landing/src/shared/lib/.gitkeep`.
> **Tests**: `wasa-landing/tests/jwt-expiry.test.ts`, `tests/auth-store.test.ts`,
> `tests/app-hydration.test.tsx` (nuevos) más la inversión declarada en `tests/structure.test.ts` (D-14).
> **NO se modifican**: `package.json`, `vite.config.ts`, `tsconfig.*.json`, `src/app/main.tsx`,
> `src/app/index.css`, `src/pages/LandingPage/index.tsx`, `src/shared/config/env.ts`,
> `src/shared/lib/aliasProbe.ts`, `tests/setup.ts`, ni nada bajo `fastapi_bridge/`.
>
> **Ningún test emite red real**, ninguno usa un JWT emitido por un Bridge real (ni vencido) y
> ninguno depende del reloj del sistema sin congelarlo (D-13).

## 1. Precondición: firma de las decisiones de governance ALTO

- [x] 1.1 Presentar al usuario **D-1** (falla cerrada; en particular: token **sin claim `exp`** ⇒ vencido) y obtener confirmación explícita; si elige la interpretación literal del estándar, actualizar el escenario "Payload JSON sin claim de expiración" de `specs/jwt-expiry-inspection/spec.md` **antes** de escribir su test
- [x] 1.2 Presentar **D-2** (la restauración **borra** del almacenamiento la sesión vencida/corrupta/incompleta) y obtener confirmación; si se rechaza, quitar los escenarios de purga del requirement "Una sesión inválida no sobrevive y no queda almacenada"
- [x] 1.3 Presentar **D-3** (clave única `wasa.auth` con `{token, email}` en JSON, en vez de dos claves separadas) y obtener confirmación del nombre y la forma; verificar con el usuario que ninguna otra pieza del mismo origen (Dashboard existente) lee ese almacenamiento hoy
- [x] 1.4 Presentar **D-4** (un `localStorage` que lanza degrada la persistencia pero no rompe la app) señalando que **contradice** el criterio de fallo ruidoso de `shared/config/env.ts`, y obtener confirmación
- [x] 1.5 Presentar **D-5** (sin tolerancia de reloj; `now >= exp` ya es vencido) y obtener confirmación
- [x] 1.6 Presentar **D-6** (hidratación en `useEffect` ⇒ un frame no autenticado; **sin** `isHydrated` en el estado) con sus tres salidas (a/b/c) y obtener una elección explícita; si el usuario elige (b), agregar `isHydrated` a la forma del estado en `specs/auth-session-state/spec.md` antes de empezar
- [x] 1.7 Anotar en este archivo, bajo cada decisión, la respuesta obtenida; no continuar al grupo 2 con alguna sin responder

**Respuestas firmadas (confirmadas por el usuario antes de este apply, ver design.md D-1..D-6):**
- D-1: confirmado — falla cerrada, incluido token sin `exp` ⇒ vencido. Sin cambios al spec.
- D-2: confirmado — la restauración purga la sesión vencida/corrupta/incompleta del almacenamiento.
- D-3: confirmado — clave única `wasa.auth` con `{token, email}` en JSON. No hay otra pieza del mismo origen leyendo ese storage hoy (el Dashboard existente es una app Node/Express separada, no comparte origen con `wasa-landing`).
- D-4: confirmado — `localStorage` que lanza degrada la persistencia, no la app; divergencia deliberada de `shared/config/env.ts`, documentada en D-4.
- D-5: confirmado — sin tolerancia de reloj, `now >= exp` es vencido.
- D-6: confirmado — opción **(a)**: hidratación en `useEffect`, se acepta el frame no autenticado, sin `isHydrated` en el estado.

## 2. Safety net

- [x] 2.1 Ejecutar `npm run test:run` en `wasa-landing/` y anotar el baseline (`N passed`); si algo ya falla, reportarlo como fallo preexistente y **no** arreglarlo en este change — **baseline: 7 test files, 74 tests passed**
- [x] 2.2 Ejecutar `npx tsc -b --noEmit`(o `npm run build`) y anotar que el árbol compila limpio **antes** de tocarlo — **compila limpio (sin salida/errores)**
- [x] 2.3 Ejecutar aislado `npx vitest run tests/structure.test.ts tests/fsd-boundaries.test.ts` y anotar el conteo verde: son los dos archivos que este change puede alterar por efecto colateral (D-14) — **2 test files, 32 tests passed**
- [x] 2.4 Releer `src/app/App.tsx`, `src/app/main.tsx` y `vite.config.ts` y confirmar de primera mano: que `App` no tiene hooks hoy, que el montaje es bajo `<StrictMode>` (D-6) y que los tests se descubren sólo bajo `tests/**` (nada colocado junto al código) — confirmado: `App.tsx` sin hooks, `main.tsx` monta bajo `<StrictMode>`, `vite.config.ts` tiene `test.include: ['tests/**/*.test.{ts,tsx}']`

## 3. Andamiaje de tests (D-13)

- [x] 3.1 Crear `wasa-landing/tests/support/jwt.ts` con el helper `makeJwt(payload: object): string` que codifique el payload en **base64url** (sin librería, sin relleno) y agregue un header y una firma de relleno; verificar con un test directo del propio helper que el resultado tiene tres segmentos y que su segmento central vuelve a decodificar al payload original — `tests/jwt-test-support.test.ts`
- [x] 3.2 Extender el helper con `makeJwtExpiringIn(seconds: number)`, construido **relativo al reloj congelado** del test y no a `Date.now()` real; verificar con un test que con `vi.setSystemTime` fijo produce siempre el mismo `exp` — `tests/jwt-test-support.test.ts`
- [x] 3.3 Crear `tests/jwt-expiry.test.ts` con `beforeEach(vi.useFakeTimers)` + `vi.setSystemTime(...)` y `afterEach(vi.useRealTimers)`; verificar que el archivo se recolecta y que un test trivial de reloj congelado pasa
- [x] 3.4 Crear `tests/auth-store.test.ts` con `beforeEach` que haga `localStorage.clear()` y restaure el store a su estado inicial vía `useAuthStore.setState(initial, true)`; verificar con dos tests consecutivos que escriben estado que el segundo arranca limpio (prueba del aislamiento, no del store)
- [x] 3.5 Escribir en `tests/support/storage.ts` los helpers que hacen que `localStorage` lance en `getItem`/`setItem`/`removeItem` (vía `vi.spyOn(Storage.prototype, ...)`) y que **restauran** el spy; verificar con un test directo que dentro del helper la operación lanza y fuera vuelve a funcionar — `tests/jwt-test-support.test.ts`

## 4. `jwtIsExpired`: token vigente vs. vencido (spec: requirements 1 y 2 de `jwt-expiry-inspection`)

- [x] 4.1 RED: escribir el test que afirma que un token con `exp` a 24 h en el futuro **no** está vencido, importando `jwtIsExpired` desde `@shared/lib/utils`; ejecutar y verificar que falla porque el módulo no existe — confirmado (`Failed to resolve import "@shared/lib/utils"`)
- [x] 4.2 GREEN: crear `src/shared/lib/utils.ts` con la implementación mínima que decodifique el payload y devuelva `now >= exp`; ejecutar y verificar que el test de 4.1 pasa
- [x] 4.3 TRIANGULATE: agregar los tests de `exp` una hora en el pasado (⇒ vencido) y `exp` un segundo en el futuro (⇒ vigente); ejecutar y verificar que pasan
- [x] 4.4 TRIANGULATE: agregar el test del **límite cerrado** (D-5) — `exp` exactamente igual al segundo actual del reloj congelado ⇒ **vencido**, no vigente; ejecutar y verificar que pasa (este es el test que distingue `>=` de `>`)
- [x] 4.5 TRIANGULATE: agregar el test que avanza el reloj con `vi.setSystemTime` más allá del `exp` de un mismo token y afirma que el veredicto pasa de "vigente" a "vencido" sin que el token cambie; ejecutar y verificar que pasa
- [x] 4.6 TRIANGULATE: agregar el test que afirma que dos tokens con el mismo `exp` futuro pero distintos `sub`/`iat`/claims desconocidos reciben el mismo veredicto; ejecutar y verificar que pasa

## 5. `jwtIsExpired`: falla cerrada (spec: "Todo token que no se pueda leer con confianza se reporta como vencido", D-1)

- [x] 5.1 RED: escribir el test que afirma que la **cadena vacía** devuelve `true` y **no lanza**; ejecutar y verificar que falla (la implementación mínima de 4.2 lanza al decodificar) — confirmado (`InvalidCharacterError` sin capturar)
- [x] 5.2 GREEN: envolver la decodificación en un camino que devuelva `true` ante cualquier fallo, sin propagar la excepción; ejecutar y verificar que el test de 5.1 pasa
- [x] 5.3 TRIANGULATE: agregar los casos de cadena sin tres segmentos (`"no-soy-un-token"`), segmento central no decodificable, y payload que decodifica a texto que no es JSON; ejecutar y verificar que los tres devuelven `true` sin lanzar
- [x] 5.4 TRIANGULATE: agregar el caso de payload JSON válido **sin claim `exp`** ⇒ `true` (decisión firmada en 1.1); ejecutar y verificar que pasa
- [x] 5.5 TRIANGULATE: agregar los casos de `exp` no numérico — cadena, `null`, objeto, y los numéricos degenerados `NaN` / `Infinity` — todos ⇒ `true`; ejecutar y verificar que pasan
- [x] 5.6 Verificar explícitamente por test que **ninguna** de las entradas inválidas de 5.1–5.5 propaga una excepción (envolver cada llamada en una aserción de "no lanza"), no sólo que devuelve `true`

## 6. `jwtIsExpired`: base64url y ausencia de dependencias externas (spec: requirements 4 y 5, D-10)

- [x] 6.1 RED: escribir el test con un payload **que contenga los caracteres `-` y `_`** en su codificación y `exp` futuro, afirmando "no vencido"; ejecutar y verificar si falla — si la implementación de 4.2 usó `atob` sin traducir el alfabeto, este es el bug que el test caza — **confirmado RED**: `expected true to be false` (el token sí contenía `-`/`_`, `atob` plano lo malinterpretó)
- [x] 6.2 GREEN: traducir `-`→`+`, `_`→`/` y reponer el relleno hasta el múltiplo de cuatro antes de `atob`; ejecutar y verificar que el test de 6.1 pasa
- [x] 6.3 TRIANGULATE: agregar el test con un payload cuya longitud codificada **no sea múltiplo de cuatro** y carezca de relleno, con `exp` futuro ⇒ "no vencido"; ejecutar y verificar que pasa
- [x] 6.4 TRIANGULATE: agregar el test de firma inválida con `exp` futuro ⇒ "no vencido" (la inspección no autentica, D-10/spec requirement 5); ejecutar y verificar que pasa
- [x] 6.5 Verificar por test que el módulo **no emite red**: espiar `globalThis.fetch` (y `XMLHttpRequest` si aplica) y afirmar cero invocaciones durante una inspección
- [x] 6.6 Verificar por inspección de `src/shared/lib/utils.ts` que no importa ninguna librería de terceros ni ningún módulo de `@app`/`@pages`/`@widgets`/`@features`/`@entities`, y ejecutar `npx vitest run tests/fsd-boundaries.test.ts` para confirmar que las fronteras FSD siguen verdes (D-12) — confirmado: `utils.ts` no tiene ningún `import`; `fsd-boundaries.test.ts` 6/6 verde
- [x] 6.7 REFACTOR: extraer la decodificación base64url a una función privada del módulo con nombre propio, dejar el comentario que explica por qué `atob`/latin1 alcanza para leer `exp` (D-10) y por qué la función falla cerrada (D-1); ejecutar toda la suite y verificar que sigue verde — `decodeBase64UrlSegment` extraída con el comentario D-10
- [x] 6.8 Verificar por test que la inspección es pura: invocarla tres veces con el reloj detenido sobre el mismo token da el mismo veredicto y deja `localStorage` exactamente como estaba

## 7. `authStore`: forma del estado e invariante (spec: "Estar autenticado equivale a tener un token de sesión", D-8)

- [x] 7.1 RED: escribir el test que importa `useAuthStore` desde `@app/stores/authStore` y afirma el **estado inicial**: `token === null`, `email === null`, `isAuthenticated === false`; ejecutar y verificar que falla porque el módulo no existe — confirmado (`Failed to resolve import "@app/stores/authStore"`)
- [x] 7.2 GREEN: crear `src/app/stores/authStore.ts` con `create<AuthState>()` y ese estado inicial, más las tres acciones como cuerpos vacíos tipados; ejecutar y verificar que el test de 7.1 pasa
- [x] 7.3 TRIANGULATE: agregar el test que afirma que la superficie pública del store son exactamente `token`, `email`, `isAuthenticated`, `login`, `logout`, `hydrate` — ni un setter suelto que permita fijar `isAuthenticated` por separado (D-8); ejecutar y verificar que pasa
- [x] 7.4 Escribir el helper de test `expectInvariant()` que afirme `isAuthenticated === (token !== null)` sobre el estado actual, y usarlo desde acá en adelante tras **cada** transición de los grupos 8..11

## 8. `authStore.login`: establecer y recordar (spec: "Iniciar sesión establece la sesión y la recuerda" + "Sólo se recuerda lo mínimo")

- [x] 8.1 RED: escribir el test que llama `login(token, email)` y afirma que el estado expone ese token, ese email e `isAuthenticated === true`; ejecutar y verificar que falla contra el cuerpo vacío de 7.2
- [x] 8.2 GREEN: implementar `login` con un **único** `set()` que escriba las tres claves juntas (D-8); ejecutar y verificar que el test de 8.1 pasa y que `expectInvariant()` se sostiene
- [x] 8.3 RED: escribir el test que afirma que tras `login` el almacenamiento contiene la sesión bajo la clave única `wasa.auth` con `{token, email}` en JSON (D-3); ejecutar y verificar que falla
- [x] 8.4 GREEN: agregar la persistencia dentro de `login`, con la serialización en un helper privado del módulo (D-12); ejecutar y verificar que el test de 8.3 pasa
- [x] 8.5 TRIANGULATE: agregar el test de **segundo `login`** con otro token y otro email, afirmando que ni el estado ni el almacenamiento conservan rastro de los primeros; ejecutar y verificar que pasa
- [x] 8.6 TRIANGULATE: agregar el test que enumera **todas** las claves de `localStorage` tras un `login` y afirma que la aplicación escribió exactamente una, y que su contenido tiene exactamente los campos `token` y `email` — ni uno más; ejecutar y verificar que pasa
- [x] 8.7 Agregar el test que afirma que ninguna contraseña llega al almacenamiento: llamar `login` en un flujo donde la contraseña esté a mano y afirmar que ningún valor almacenado la contiene (spec: "La contraseña nunca se persiste")

## 9. `authStore.logout`: borrado local y completo (spec: "Cerrar sesión borra la sesión por completo y sin hablar con el servidor")

- [x] 9.1 RED: escribir el test que, tras un `login`, llama `logout()` y afirma `token === null`, `email === null`, `isAuthenticated === false`; ejecutar y verificar que falla
- [x] 9.2 GREEN: implementar `logout` con un único `set()` que restaure el estado no autenticado; ejecutar y verificar que el test de 9.1 pasa y que `expectInvariant()` se sostiene
- [x] 9.3 RED/GREEN: escribir el test que afirma que tras `logout` no queda **ningún** dato de sesión en el almacenamiento, y agregar el `removeItem` correspondiente; ejecutar y verificar que pasa
- [x] 9.4 TRIANGULATE: agregar el test que afirma que `logout` **no emite ninguna petición de red** (espiar `globalThis.fetch` y afirmar cero invocaciones); ejecutar y verificar que pasa
- [x] 9.5 TRIANGULATE: agregar el test que llama `logout()` estando ya no autenticado y afirma que el estado sigue no autenticado y que no se propaga error (idempotencia); ejecutar y verificar que pasa
- [x] 9.6 TRIANGULATE: agregar el test de secuencia `login → logout → hydrate` que afirma que la aplicación queda no autenticada (la sesión cerrada no reaparece al recargar); ejecutar y verificar que pasa

## 10. `authStore.hydrate`: restaurar sólo lo vigente (spec: "La sesión se restaura al recargar sólo si el token sigue vigente")

- [x] 10.1 RED: escribir el test que siembra en el almacenamiento una sesión con token **vigente**, llama `hydrate()` y afirma que el estado queda autenticado con ese token y ese email; ejecutar y verificar que falla contra el cuerpo vacío de 7.2
- [x] 10.2 GREEN: implementar `hydrate` — leer, parsear, consultar `jwtIsExpired`, y en el caso vigente escribir el estado en un único `set()`; ejecutar y verificar que el test de 10.1 pasa y que `expectInvariant()` se sostiene
- [x] 10.3 TRIANGULATE: agregar el test con el almacenamiento **vacío** ⇒ no autenticado, sin error propagado; ejecutar y verificar que pasa
- [x] 10.4 TRIANGULATE: agregar el test que hidrata la **misma** sesión sembrada dos veces con el reloj movido en el medio (primero vigente, después vencido) y afirma que el primer resultado es autenticado y el segundo no; ejecutar y verificar que pasa
- [x] 10.5 Verificar por test que `hydrate` consume el veredicto de `jwtIsExpired` y no reimplementa la comparación de `exp` por su cuenta (espiar el módulo con `vi.mock`/`vi.spyOn` y afirmar que se invocó con el token leído)

## 11. `authStore.hydrate`: sesión inválida, purga y almacenamiento hostil (spec: "Una sesión inválida no sobrevive…" + "Un almacenamiento indisponible degrada la persistencia…", D-2/D-4)

- [x] 11.1 RED: escribir el test que siembra una sesión con token **vencido**, llama `hydrate()` y afirma estado no autenticado; ejecutar y verificar que falla o pasa según la implementación de 10.2, y ajustar hasta que la rama exista explícitamente — ya pasaba (la rama de 10.2 ya cubría vencido)
- [x] 11.2 RED/GREEN: escribir el test que afirma que tras hidratar un token vencido el almacenamiento queda **vacío** (D-2), e implementar la purga; ejecutar y verificar que pasa
- [x] 11.3 TRIANGULATE: agregar el caso de contenido **ilegible** bajo la clave de sesión (texto que no es JSON) ⇒ no autenticado + purgado + sin error propagado; ejecutar y verificar que pasa
- [x] 11.4 TRIANGULATE: agregar los casos de sesión **incompleta** — falta `token`, falta `email`, y valores presentes pero de tipo equivocado (número, `null`) ⇒ no autenticado + purgado; ejecutar y verificar que pasan
- [x] 11.5 TRIANGULATE: agregar el test de **idempotencia** — llamar `hydrate()` dos veces seguidas sobre el mismo almacenamiento (sembrado vigente, y luego sembrado vencido) y afirmar que el estado final es idéntico al de una sola llamada y que no hubo escrituras adicionales (D-6, corolario de `<StrictMode>`); ejecutar y verificar que pasa
- [x] 11.6 RED/GREEN: usando el helper de 3.5, escribir el test de `login` con `setItem` que lanza ⇒ el estado queda **autenticado en memoria** y no se propaga error (D-4); implementar el `try/catch`; ejecutar y verificar que pasa — **confirmado RED** antes del try/catch (`thrown` era `true`)
- [x] 11.7 TRIANGULATE: agregar el test de `hydrate` con `getItem` que lanza ⇒ no autenticado, sin error propagado; y el de `logout` con `removeItem` que lanza ⇒ estado en memoria limpio igualmente, sin error propagado; ejecutar y verificar que pasan — **confirmado RED** antes del try/catch
- [x] 11.8 REFACTOR: extraer a helpers privados del módulo la lectura, la escritura y la purga del almacenamiento (cada uno con su `try/catch`), de modo que `authStore.ts` sea el único archivo del proyecto que menciona `localStorage` (D-12); ejecutar toda la suite y verificar que sigue verde — `readRawSession`/`writeSession`/`clearSession`/`parseSession`
- [x] 11.9 Verificar por test de código fuente que ningún archivo bajo `src/` fuera de `app/stores/authStore.ts` lee o escribe `localStorage` (spec: "Punto único de acceso al almacenamiento") — `tests/storage-single-access-point.test.ts`

## 12. `App.tsx`: la hidratación se dispara al montar (spec: "La restauración ocurre al montar la aplicación y es idempotente", D-6)

- [x] 12.1 RED: escribir `tests/app-hydration.test.tsx` que siembra una sesión vigente, renderiza `<App />` con Testing Library y afirma —esperando el efecto— que el store queda autenticado; ejecutar y verificar que falla porque `App` no hidrata — confirmado (`expected false to be true`)
- [x] 12.2 GREEN: agregar en `App.tsx` el `useEffect(() => { hydrate() }, [])` tomando la acción del store (referencia estable, D-9); ejecutar y verificar que el test de 12.1 pasa
- [x] 12.3 TRIANGULATE: agregar el test que renderiza `<App />` **dentro de `<StrictMode>`** con una sesión vigente sembrada y afirma que el estado final es el mismo que sin él y que el almacenamiento no sufrió escrituras extra (doble montaje, D-6); ejecutar y verificar que pasa
- [x] 12.4 TRIANGULATE: agregar el test que renderiza `<App />` con almacenamiento **corrupto** y afirma que la interfaz se renderiza igual (el `LandingPage` sigue en el árbol), sin error sin capturar ni pantalla en blanco; ejecutar y verificar que pasa
- [x] 12.5 Verificar por test/inspección que la hidratación se dispara desde **un único lugar**: ningún otro archivo bajo `src/` invoca `hydrate` (spec: "Punto único de restauración") — `tests/storage-single-access-point.test.ts`
- [x] 12.6 Verificar que `App.tsx` sigue renderizando exactamente `<LandingPage />` y que `tests/landing-page.test.tsx` sigue verde sin tocarlo — confirmado, verde

## 13. Consumo por selector (spec: "El estado de sesión es consumible por el resto del frontend…", D-9)

- [x] 13.1 Escribir el test que afirma que un componente suscripto **por selector** a `isAuthenticated` no vuelve a renderizarse cuando cambia únicamente el `email` del store (contar renders con un contador en el componente de prueba); ejecutar y verificar que pasa
- [x] 13.2 Escribir el test que afirma que el token es legible fuera de React con `useAuthStore.getState().token` tras un `login` — la forma exacta en que el interceptor Axios de CHANGE-16 lo consumirá; ejecutar y verificar que pasa
- [x] 13.3 Verificar por test que las referencias de `login`/`logout`/`hydrate` son **estables** entre renders (la misma función antes y después de una transición de estado), para que puedan usarse como dependencias de efectos sin reejecutarlos

## 14. Actualizaciones declaradas sobre el scaffold (D-14)

- [x] 14.1 Invertir en `tests/structure.test.ts` el caso `'src/app/stores/authStore.ts does not exist'` a que **existe**, y agregar que `src/app/stores/` no contiene ningún otro store; ejecutar `npx vitest run tests/structure.test.ts` y verificar que pasa
- [x] 14.2 Eliminar `src/app/stores/.gitkeep` y `src/shared/lib/.gitkeep`; ejecutar `tests/structure.test.ts` y verificar que el caso "todo `.gitkeep` bajo `src/` está anotado" sigue verde con los que quedan (`providers/`, `entities/`, `features/`, `widgets/`, `shared/ui/`, `shared/api/`)
- [x] 14.3 Verificar que el caso "`src/entities`, `src/shared/ui`, `src/shared/api`, `src/features` contienen sólo `.gitkeep`" **no** se modificó ni se rompió: este change no toca esos directorios

## 15. Cierre y verificación integral

- [x] 15.1 Ejecutar `npm run test:run` completo en `wasa-landing/` y verificar que el total supera el baseline de 2.1 sin ninguna regresión (ningún test previamente verde en rojo, salvo el caso invertido de 14.1) — **13 test files, 137 tests passed** (baseline: 7 files, 74 tests)
- [x] 15.2 Ejecutar `npx tsc -b --noEmit` y verificar cero errores de tipos en `authStore.ts` y `utils.ts` (criterio de aceptación explícito de CHANGE-13 en `CHANGES.md`) — sin salida, cero errores
- [x] 15.3 Ejecutar `npm run build` y verificar que termina con código `0`, y `npm run lint` sin errores nuevos — build exit 0 (`✓ built in 867ms`), lint exit 0
- [x] 15.4 Ejecutar la suite dos veces seguidas y en orden aleatorio si el runner lo permite, verificando que no hay flakiness por reloj, `localStorage` o estado residual del store (D-13) — dos corridas consecutivas, 137/137 ambas veces; no se cambió `vite.config.ts` para forzar orden aleatorio (fuera de scope, D-14 sólo permite tocar `structure.test.ts`/`fsd-boundaries.test.ts` como colateral)
- [x] 15.5 Recorrer uno por uno los seis criterios de aceptación de CHANGE-13 en `CHANGES.md` y anotar, para cada uno, el test que lo demuestra — ver reporte final
- [x] 15.6 Recorrer los requirements de `specs/jwt-expiry-inspection/spec.md` y `specs/auth-session-state/spec.md` y verificar que **cada escenario** tiene al menos un test que lo ejerce; reportar cualquiera que quedara sin cubrir en vez de darlo por implícito — verificado escenario por escenario, cobertura completa (ver reporte final)
- [x] 15.7 Revisar por lectura final que `src/shared/lib/utils.ts` no conoce el dominio, que `authStore.ts` es el único módulo que toca el almacenamiento, y que ninguna decisión firmada en el grupo 1 quedó implementada de otra manera — confirmado: `utils.ts` tiene cero imports; `grep -rn localStorage src/` sólo devuelve líneas de `authStore.ts`
- [x] 15.8 Marcar `[x]` CHANGE-13 en `CHANGES.md` y reportar al usuario las decisiones firmadas junto con cualquier desvío surgido durante el apply
