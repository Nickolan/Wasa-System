> **Modo TDD estricto activo.** Cada grupo marcado `(TDD)` sigue el ciclo
> RED → GREEN → TRIANGULATE → REFACTOR. No se escribe código de producción sin un
> test que falle primero. Los grupos 1, 2 y 9 no son ciclos TDD (checkpoint,
> movimiento de archivos y verificación final).
>
> **Safety net obligatorio**: este change modifica archivos existentes
> (`tests/structure.test.ts`, y —si se adopta D-3/A— la ubicación del `authStore`
> y cinco sitios de import). Antes de tocar nada, correr `npm run test:run` y
> registrar el baseline de tests verdes. Ese número **no puede bajar** en ningún
> momento. Si algún test ya falla al empezar, **detenerse** y reportarlo como
> fallo preexistente, sin arreglarlo dentro de este change.
>
> **Governance ALTO**: es la superficie por la que viaja una contraseña en texto
> plano. D-7 (no loguear nunca) y D-8 (allowlist explícita del cuerpo) no son
> preferencias de estilo: si un paso los incomoda, se reporta, no se relaja.
>
> Todos los comandos se ejecutan desde `wasa-landing/` salvo indicación contraria.
>
> Referencias: `design.md` (decisiones D-1..D-17, riesgos R-1..R-7),
> `specs/auth-client-requests/spec.md` y `specs/auth-form-flows/spec.md`
> (requirements y escenarios = criterios de aceptación).

## 1. Checkpoint bloqueante y baseline

- [x] 1.1 **Resuelto (checkpoint 2026-08-23).** D-3 opción A adoptada: mover el store a `src/entities/user/model/authStore.ts` y enmendar en `CLAUDE.md` la regla de `entities/` (ya aplicado). Opciones B y C descartadas.
- [x] 1.2 Resuelto: pregunta 2 (mensaje genérico) y 3 (timeout de axios) aprobadas tal como se propusieron en `design.md`, sin objeción
- [x] 1.3 Correr `npm run test:run` y registrar el baseline de archivos y tests verdes heredado de CHANGE-13/14/15. Si algún test ya falla, detenerse y reportarlo como fallo preexistente — **baseline: 24 test files, 215 tests, todos verdes**
- [x] 1.4 Verificar que la rama de trabajo es `niko/c-16-feature-auth` y que el árbol está limpio antes de empezar — confirmado (única modificación previa: `CLAUDE.md`, más `openspec/changes/feature-auth/` sin trackear)

## 2. Resolución de la frontera FSD (solo si el usuario eligió D-3/A)

> Este grupo deja la suite en verde **antes** de que exista una sola línea de la
> slice nueva. Es un movimiento sin cambio de comportamiento: si algún test de
> CHANGE-13 se pone en rojo por algo que no sea la ruta del import, el movimiento
> está mal hecho.

- [x] 2.1 Mover `src/app/stores/authStore.ts` a `src/entities/user/model/authStore.ts` sin modificar una sola línea de su cuerpo — `git mv`, contenido intacto
- [x] 2.2 Exportar `useAuthStore` (y el tipo de su estado, si hace falta) desde `src/entities/user/index.ts`, siguiendo el patrón de API pública que ya usa esa slice
- [x] 2.3 Actualizar los importadores existentes a `@entities/user`: `src/app/App.tsx`, `tests/app-hydration.test.tsx`, `tests/auth-store.test.ts`, `tests/auth-store-selectors.test.tsx`
- [x] 2.4 Actualizar los dos literales de ruta del store en `tests/storage-single-access-point.test.ts` (el del punto único de acceso a `localStorage` y el del punto único que invoca `hydrate`)
- [x] 2.5 Actualizar en `tests/structure.test.ts` el inventario de `src/entities/user/` (ahora incluye `model/authStore.ts`) y el de `src/app/stores/` (ahora vacío: **se decidió dejarlo con `.gitkeep` anotado**, consistente con `src/app/providers/.gitkeep`)
- [x] 2.6 Enmendar en `CLAUDE.md` la regla de `entities/` según lo aprobado en 1.1 (ya estaba aplicado), y anotar en `CHANGES.md` la desviación respecto de la ubicación que ese documento declara para el store (nota agregada bajo CHANGE-13)
- [x] 2.7 Correr `npm run test:run` y `npm run build` — **hallazgo no anticipado por design.md**: `tests/auth-schemas.test.ts` (CHANGE-14, "entities/user es modelo puro") prohibía toda mención de `localStorage` y todo import de `authStore` dentro de `entities/user/`, lo cual D-3/A invalida directamente y que el D-17 de `design.md` no enumeró. Se actualizó con la misma exención que ya usa `storage-single-access-point.test.ts` (excluye `model/authStore.ts`, y a `index.ts` solo de la regla "no importa authStore" porque re-exportarlo es su API pública). Suite: 24 archivos, 220 tests verdes (por encima del baseline 215; ningún test eliminado, solo dos `it.each` que antes eran uno se separaron). `npm run build`: exit 0, sin TS errors

## 3. `lib/` de la slice — cliente HTTP, error y mensajes (TDD)

> Specs: `auth-client-requests` → Requirements "El cliente llama a los dos endpoints
> públicos…", "Toda respuesta no exitosa se convierte en un error de cliente
> uniforme…", "Las peticiones de autenticación no pasan por el cliente HTTP
> autenticado". Decisiones: D-1, D-2, D-4, D-5, D-14, D-16.

- [x] 3.1 **RED**: crear `tests/auth-request-error.test.ts` con el primer caso de `AuthRequestError` — confirmado rojo (módulo inexistente)
- [x] 3.2 **GREEN**: crear `src/features/auth/lib/authErrors.ts` con la clase `AuthRequestError extends Error`, `status`/`problem` de solo lectura (D-4), `AuthApiError` importado de `@entities/user` sin redefinir
- [x] 3.3 **TRIANGULATE**: casos de la spec agregados (instanceof distingue de Error común, status null, problem null, problem poblado) — 5/5 verdes
- [x] 3.4 **RED**: agregado el caso del reconocedor de forma (`isAuthApiErrorShape`) y `toAuthRequestError` — confirmado rojo (7 tests fallando: función inexistente)
- [x] 3.5 **GREEN + TRIANGULATE**: implementado el chequeo de forma (D-15) y `toAuthRequestError` cubriendo las tres ramas — 12/12 verdes
- [x] 3.6 **RED**: creado `tests/auth-messages.test.ts` — confirmado rojo (módulo inexistente)
- [x] 3.7 **GREEN + TRIANGULATE**: creado `src/features/auth/lib/authMessages.ts` con `GENERIC_AUTH_ERROR_MESSAGE` declarado una sola vez y `resolveLoginErrorMessage`/`resolveRegisterErrorMessage` — 7/7 verdes (401 login, 409 registro, 409 login→genérico, 401 registro→genérico, 500→genérico, null→genérico, literal exacto)
- [x] 3.8 **RED → GREEN**: creado `tests/auth-http.test.ts` (no estaba explícito en el plan como RED, pero D-1/D-2 exigían prueba propia porque los tests de grupo 4/5 mockean `authHttp` y nunca ejercitan su config real) verificando `baseURL`, `timeout: 15000` y ausencia de interceptores — rojo confirmado, luego creado `src/features/auth/lib/authHttp.ts` — 3/3 verdes
- [x] 3.9 **REFACTOR**: docstrings de *por qué* ya incorporadas en el paso GREEN de cada módulo. `tests/auth-request-error.test.ts` + `auth-messages.test.ts` + `auth-http.test.ts` corridos juntos: 22/22 verdes

## 4. `loginApi` — transporte del inicio de sesión (TDD)

> Specs: `auth-client-requests` → "El cliente llama a los dos endpoints públicos…",
> "Una respuesta exitosa devuelve el token…", "Toda respuesta no exitosa…".

- [x] 4.1 **RED**: creado `tests/auth-login-api.test.ts` con `vi.mock('@features/auth/lib/authHttp')` como doble — confirmado rojo (módulo inexistente)
- [x] 4.2 **GREEN**: creado `src/features/auth/login/api/loginApi.ts` — 1/1 verde
- [x] 4.3 **TRIANGULATE**: agregados los 7 escenarios restantes — 8/8 verdes. **Nota de implementación**: `instanceof AuthRequestError` con `vi.resetModules()` requiere importar `AuthRequestError` dinámicamente en el mismo bloque que `loginApi` (no estáticamente al tope del archivo), porque `resetModules()` crea una nueva identidad de clase — se documentó inline en el test
- [x] 4.4 **REFACTOR**: confirmado transporte puro — sin mensajes al usuario, sin conocimiento del store, el `try/catch` solo traduce el error vía `toAuthRequestError`, nunca lo traga

## 5. `registerApi` — transporte del registro (TDD)

> Specs: `auth-client-requests` → "El cuerpo del registro se proyecta explícitamente
> y excluye la confirmación de contraseña" (D-8), más las mismas de transporte.

- [x] 5.1 **RED**: creado `tests/auth-register-api.test.ts` — confirmado rojo (módulo inexistente)
- [x] 5.2 **GREEN**: creado `src/features/auth/register/api/registerApi.ts`, cuerpo campo por campo como `UserRegisterRequest`, sin spread ni `delete` (D-8) — 1/1 verde
- [x] 5.3 **TRIANGULATE — caso de seguridad**: confirmado que `confirmPassword` no viaja, y que un campo extra arbitrario (`isAdmin`) tampoco — 7/7 verdes
- [x] 5.4 **TRIANGULATE**: ruta `/register`, método POST (implícito en `authHttp.post`), `409`, `422` y fallo sin respuesta cubiertos
- [x] 5.5 **REFACTOR**: docstring ya incorporada en el paso GREEN explicando la allowlist explícita y `extra="forbid"` del Bridge

## 6. `useLogin` — orquestación del inicio de sesión (TDD)

> Specs: `auth-form-flows` → "La validación local es la puerta previa a la red",
> "El inicio de sesión exitoso establece la sesión y avisa a su contenedor",
> "Cada clase de fallo del servidor produce un mensaje fijo…", "El estado de envío
> es único…", "El error de servidor anterior se limpia…". Decisiones: D-9, D-10, D-11.

- [x] 6.1 **RED**: creado `tests/auth-use-login.test.tsx` con `renderHook` — confirmado rojo (módulo inexistente)
- [x] 6.2 **GREEN**: creado `src/features/auth/login/model/useLogin.ts` — 1/1 verde
- [x] 6.3 **TRIANGULATE — camino feliz**: los 4 escenarios agregados y verdes, incluido el orden D-9 verificado dentro del propio callback `onSuccess`
- [x] 6.4 **TRIANGULATE — camino de fallo**: 401/500/red/409 cubiertos — todos verdes
- [x] 6.5 **TRIANGULATE — validación como puerta**: email malformado y password vacía cubiertos, `loginApi` no invocado en ninguno
- [x] 6.6 **TRIANGULATE — estado de envío**: `isSubmitting` (post-éxito, post-fallo) y limpieza de `serverError` en el segundo intento — cubiertos
- [x] 6.7 **TRIANGULATE — R-4**: cubierto — sesión previa permanece intacta tras un 401 de un login posterior. **Suite completa: 15/15 verdes**
- [x] 6.8 **REFACTOR**: diferido a 7.6 según lo indicado — no se anticipa extracción sin ver el grupo 7

## 7. `useRegister` — orquestación del registro (TDD)

> Mismas specs que el grupo 6, rama de registro.

- [x] 7.1 **RED**: creado `tests/auth-use-register.test.tsx` — confirmado rojo (módulo inexistente)
- [x] 7.2 **GREEN**: creado `src/features/auth/register/model/useRegister.ts` — verde
- [x] 7.3 **TRIANGULATE — camino feliz**: store autenticado sin login posterior, `onSuccess` una vez y después de la sesión establecida — cubierto
- [x] 7.4 **TRIANGULATE — camino de fallo**: 409 específico, y 500/422/red/401 al genérico (parametrizado con `it.each`) — todos verdes, store sin autenticar en todos
- [x] 7.5 **TRIANGULATE — validación como puerta**: password corta y confirmación distinta bloquean la llamada — cubierto. **Suite del archivo: 10/10 verdes**
- [x] 7.6 **REFACTOR**: duplicación literal confirmada entre `useLogin`/`useRegister` (limpiar `serverError` → invocar api → `login()` → `onSuccess()`, catch → resolver mensaje). Extraída a `src/features/auth/lib/useAuthFormSubmit.ts` (genérico sobre `TValues extends FieldValues & { email: string }`); `useLogin.ts` y `useRegister.ts` quedaron como wrappers finos que solo inyectan schema/apiCall/resolveErrorMessage. Tests de ambos hooks reejecutados tras el refactor: 25/25 verdes (15 login + 10 register). `tsc -b`: 0 errores

## 8. `LoginForm` y `RegisterForm` — la interfaz (TDD)

> Specs: `auth-form-flows` → "Los formularios renderizan sus campos con los
> primitivos compartidos…", "Los formularios ignoran cómo están contenidos…",
> "El estado de envío… impide el doble envío". Decisiones: D-12, D-13, R-7.

- [x] 8.1 **RED**: creado `tests/auth-login-form.test.tsx` — confirmado rojo (módulo inexistente)
- [x] 8.2 **GREEN**: creado `src/features/auth/login/ui/LoginForm.tsx`. **R-7 no se materializó**: `Input` ya reenvía `ref`/props nativas correctamente con `register()` de RHF (confirmado también por `tests/input.test.tsx` preexistente de CHANGE-15) — no hizo falta tocar `shared/ui/Input.tsx`
- [x] 8.3 **TRIANGULATE — comportamiento**: los 4 escenarios cubiertos y verdes
- [x] 8.4 **TRIANGULATE — doble envío (D-12)**: cubierto con una promesa controlada (deferred) para observar el estado in-flight; dos clicks → una sola llamada a `loginApi`, asertado sobre el mock, no sobre el atributo
- [x] 8.5 **TRIANGULATE — D-13**: control de cambio verificado como `button type="button"`, invoca la prop, no dispara submit; verificación de código fuente confirma ausencia de `Modal`/`onClose`. **Suite del archivo: 8/8 verdes**
- [x] 8.6 **RED → GREEN → TRIANGULATE**: repetido para `tests/auth-register-form.test.tsx` y `src/features/auth/register/ui/RegisterForm.tsx` — 9/9 verdes (mismo patrón: campos, doble envío, D-13, sin Modal/onClose)
- [x] 8.7 **GREEN**: creado `src/features/auth/index.ts` exportando `LoginForm`/`RegisterForm` y sus tipos de props
- [x] 8.8 **REFACTOR**: clases Tailwind concentradas en constantes nombradas (`FORM_CLASSES`, `SERVER_ERROR_CLASSES`, `SWITCH_LINK_CLASSES`) en cada componente, siguiendo el mismo patrón que `shared/ui/Button.tsx`/`Input.tsx`. Reejecutado tras el refactor: 17/17 verdes (8 login + 9 register), `tsc -b`: 0 errores

## 9. Guardas estructurales de la slice (TDD)

> Specs: `auth-client-requests` → "Las peticiones de autenticación no pasan por el
> cliente HTTP autenticado" (D-2, R-2) y "Ningún módulo de autenticación escribe en
> la consola" (D-7). `auth-form-flows` → "La slice… respeta la dirección de capas".

- [x] 9.1 **RED → GREEN**: creado `tests/auth-slice-boundaries.test.ts`. Dado que la slice ya existía y ya cumplía la regla, el `it.each` contra código real nunca fue rojo (nada que arreglar); se agregó una fixture "guarda sobre la guarda" (mismo patrón que `fsd-boundaries.test.ts`) que prueba que el detector SÍ atraparía la violación si alguien la introdujera. Motivo documentado inline: el interceptor de CHANGE-18 desloguearía al usuario ante un login fallido (D-2, R-2)
- [x] 9.2 **RED → GREEN**: en el mismo archivo, chequeo de ausencia de `console.*` + fixture "guarda sobre la guarda" análoga (D-7). **Suite del archivo: 25/25 verdes**
- [x] 9.3 Verificado: `tests/fsd-boundaries.test.ts` pasa (6/6) con la slice nueva incorporada, sin modificarlo (`git diff` vacío sobre ese archivo)

## 10. Inventario de `src/features/` y verificación final

- [x] 10.1 Eliminado `src/features/.gitkeep`; reemplazada en `tests/structure.test.ts` la aserción "`src/features` contiene solo `.gitkeep`" por el inventario real de la slice `auth` (11 archivos), siguiendo el patrón de `entities/user`/`shared/ui`
- [x] 10.2 Confirmado: los 4 `.gitkeep` restantes (`app/providers`, `app/stores`, `shared/api`, `widgets`) siguen anotados con comentario no vacío
- [x] 10.3 `npm run test:run`: **34 test files, 326 tests, todos verdes** — por encima del baseline de 1.3 (24 archivos/215 tests), ningún test previo eliminado
- [x] 10.4 `npm run build` (`tsc -b && vite build`): salida `0`, sin errores de TypeScript
- [x] 10.5 `npm run lint` (oxlint): **0 warnings, 0 errors** en 70 archivos
- [x] 10.6 Revisión manual de governance ALTO — confirmado por inspección directa: (a) `grep -rn "console\."` sobre `src/features/auth` → sin resultados; (b) `registerApi.ts` construye el cuerpo campo por campo (`{ email: values.email, password: values.password }`), sin spread ni `delete`; (c) `grep -rn "import.meta.env"` → sin resultados (todo pasa por `@shared/config/env` vía `authHttp.ts`); (d) `grep -rn "localStorage"` → sin resultados; (e) `grep -rn "\.detail"` → sin resultados, `problem.detail` nunca se lee ni se renderiza
- [x] 10.7 Desviaciones respecto de `CHANGES.md` registradas: `AuthRequestError` en lugar de `AuthApiError` (D-4); `isSubmitting` en lugar de `isLoading` (D-10); reubicación del `authStore` a `entities/user/model/authStore.ts` (D-3/A, también anotada en `CHANGES.md` bajo CHANGE-13). **Desviación adicional no anticipada por design.md**: `tests/auth-schemas.test.ts` (CHANGE-14) tuvo que actualizarse para exceptuar `authStore.ts` de sus reglas de pureza de `entities/user` — ver nota en 2.7
