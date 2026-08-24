## Context

Este change conecta cuatro piezas ya entregadas y archivadas. El estado real del árbol al momento de proponer (verificado sobre los archivos, no sobre la KB):

| Pieza | Dónde vive hoy | Qué expone |
|---|---|---|
| `authStore` (CHANGE-13) | `src/app/stores/authStore.ts` | `useAuthStore` con `token`, `email`, `isAuthenticated`, `login(token, email)`, `logout()`, `hydrate()`. Único módulo del proyecto que toca `localStorage`. |
| Schemas Zod (CHANGE-14) | `src/entities/user/` | `loginSchema`, `registerSchema`, `PASSWORD_MIN_LENGTH`, `utf8ByteLength`, y los tipos `UserLogin`, `UserRegister`, `UserRegisterRequest`, `TokenResponse`, `AuthApiError`. API pública en `entities/user/index.ts`. |
| Primitivos de UI (CHANGE-15) | `src/shared/ui/` | `Button` (con `loading` que además deshabilita), `Input` (label + `error` + `aria-invalid` + `aria-describedby`), `Checkbox`, `Spinner`, `Modal`. |
| Puerta de entorno (CHANGE-00b) | `src/shared/config/env.ts` | `apiBaseUrl`, `dashboardUrl`. Único módulo autorizado a leer `import.meta.env` (verificado por `tests/env.test.ts`). |

Del lado del Bridge, el contrato ya está congelado por CHANGE-05 y CHANGE-07 y no se toca acá:

- `POST /api/v1/auth/register` → **201** + `TokenResponse`; **409** si el email existe; **422** si el cuerpo viola `UserRegister`; **400** si el cuerpo ni siquiera es JSON.
- `POST /api/v1/auth/login` → **200** + `TokenResponse`; **401** genérico e indistinguible ante email inexistente o contraseña incorrecta (RN-WS-12, anti-enumeración); **422**/**400** igual que arriba.
- Todo error sale en RFC 7807 (`type`, `title`, `status`, `detail`, `instance`) con media type `application/problem+json`.
- **Ninguno de los dos endpoints está limitado por rate limit**: `core/limiter.py` solo expone `scan_rate_limit` y no configura `default_limits` ni `SlowAPIMiddleware`, así que un 429 no es una respuesta esperable de auth hoy.
- El cuerpo de `register` es `{ email, password }` y el modelo Pydantic usa `extra="forbid"`: mandar `confirmPassword` produciría un 422.

Restricciones que condicionan el diseño:

- **Dirección de capas FSD, verificada por test.** `tests/fsd-boundaries.test.ts` + `tests/support/fsd.ts` recorren todo `src/` por AST con `LAYER_ORDER = ['app','pages','widgets','features','entities','shared']` y fallan ante cualquier import cuya capa destino sea *anterior* a la del importador. Esto tiene una consecuencia que ningún change anterior tuvo que enfrentar y que este sí — ver **D-3**, el punto más importante de este documento.
- **`tests/structure.test.ts` afirma hoy que `src/features/` contiene únicamente `.gitkeep`.** Este es el change que puebla esa capa; esa aserción tiene que cambiar (mismo movimiento que CHANGE-14 con `entities/` y CHANGE-15 con `shared/ui/`).
- **`tests/storage-single-access-point.test.ts`** afirma que ningún archivo de `src/` fuera de `app/stores/authStore.ts` menciona `localStorage`. Este change no toca almacenamiento, pero D-3 sí mueve ese archivo.
- **Modo TDD estricto activo.** Cada unidad entra por un test que falla primero. El runner (Vitest 4 + Testing Library + jsdom) ya está cableado desde CHANGE-00b.
- **Governance ALTO.** Es la superficie por la que viaja una contraseña en texto plano desde el navegador. Las decisiones con matiz de seguridad se explicitan y se marcan como checkpoint.

## Goals / Non-Goals

**Goals:**

- Entregar dos flujos de autenticación completos y testeados —registro e inicio de sesión— desde la validación local hasta la sesión establecida en el `authStore`.
- Dejar la comunicación con los dos endpoints públicos de auth en módulos de transporte delgados, sin lógica de presentación ni de negocio.
- Traducir todo fallo posible (401, 409, 422, 500, red caída, timeout) a un mensaje único, en castellano, decidido por el cliente.
- Dejar los formularios componibles: `LoginForm` y `RegisterForm` no saben que existe un modal, para que CHANGE-19 los monte adentro de uno sin pelear con ellos.
- Resolver —de forma explícita y aprobada— la violación de fronteras FSD que este change destapa (D-3).
- Mantener verde toda la suite existente, actualizando únicamente las aserciones que este change legítimamente invalida.

**Non-Goals:**

- **Sin modales ni muro de autenticación**: `LoginModal`, `RegisterModal`, `AuthWall` y el alternado entre ambos son CHANGE-19.
- **Sin `axiosInstance` compartido ni interceptores**: eso es CHANGE-18, y deliberadamente **no** aplica a estos endpoints (D-2).
- **Sin refresh tokens, "recordarme", recuperación de contraseña, verificación por email ni logout desde acá**: nada de eso está en el alcance v1.2 (`knowledge-base/01_vision_y_objetivos.md`).
- **Sin cambiar la política de almacenamiento del token** (localStorage vs. cookie httpOnly): decidido y cerrado en CHANGE-13; este change no lo reabre.
- **Sin medidor de fuerza de contraseña, sin mostrar/ocultar contraseña, sin autocompletado inteligente** más allá de los atributos `autocomplete` estándar.
- **Sin sistema de diseño**: utilidades Tailwind planas, concentradas para que CHANGE-20 las reemplace.
- **Sin tocar el backend, la base `db_fuzzing`, n8n ni el `dashboard/` heredado.**

## Decisions

### D-1. Estructura de la slice: dos sub-slices hermanas más un `lib/` compartido

```
src/features/auth/
├── index.ts                      ← API pública de la slice (lo único que CHANGE-19 importa)
├── lib/
│   ├── authHttp.ts               ← instancia axios propia de auth (D-2)
│   ├── authErrors.ts             ← AuthRequestError + traducción RFC 7807 → error de cliente (D-4)
│   └── authMessages.ts           ← mensajes al usuario por código de estado (D-5)
├── login/
│   ├── api/loginApi.ts
│   ├── model/useLogin.ts
│   └── ui/LoginForm.tsx
└── register/
    ├── api/registerApi.ts
    ├── model/useRegister.ts
    └── ui/RegisterForm.tsx
```

**Decisión**: `login/` y `register/` son sub-slices hermanas con la tríada `api`/`model`/`ui` que pide el roadmap, y lo que ambas comparten vive en `features/auth/lib/`, no duplicado ni promovido a `shared/`.

**Rationale**: el roadmap fija las seis rutas de `login/` y `register/`; no fija dónde va lo común, y hay tres cosas comunes reales (el cliente HTTP, la clase de error, el mensaje genérico de fallo). Duplicarlas produce dos traducciones de error que divergen en la primera corrección. Subirlas a `shared/` viola la regla dura de que `shared/` no conoce el dominio WASA (`authHttp` conoce la ruta `/api/v1/auth`).

`index.ts` como API pública replica el patrón que CHANGE-14 fijó en `entities/user/index.ts` (D-8 de ese change): CHANGE-19 importa `{ LoginForm, RegisterForm } from '@features/auth'` y nunca una ruta interna, de modo que la organización interna de la slice pueda cambiar sin tocar a sus consumidores.

**Alternativa descartada**: una sola sub-slice `features/auth/` con `api/authApi.ts` que exporte las dos funciones. Es menos archivos, pero contradice literalmente el scope del roadmap y mezcla dos flujos que tienen mensajes de error, schemas y campos distintos.

---

### D-2. Cliente HTTP propio de la slice, no el `axiosInstance` compartido de CHANGE-18 — ni ahora ni después

**Decisión**: `features/auth/lib/authHttp.ts` crea su **propia** instancia de axios con `baseURL: apiBaseUrl`, sin interceptores de request ni de response. Cuando CHANGE-18 cree `src/shared/api/axiosInstance.ts`, esta slice **no** migra a esa instancia.

**Rationale**: no es solo una cuestión de orden temporal (CHANGE-18 va después). Los dos endpoints de auth son **públicos** y su semántica de error es incompatible con la del cliente autenticado:

1. El interceptor de request de CHANGE-18 adjunta `Authorization: Bearer <token>` desde el store. Mandar un token en un login es, en el mejor caso, ruido; en el peor, un token viejo viajando por la red sin necesidad.
2. El interceptor de response de CHANGE-18 hace `authStore.logout()` ante un 401. Pero el 401 de `/auth/login` significa **"credenciales incorrectas"**, no "sesión expirada". Con esa instancia, un usuario ya logueado que abre el modal y tipea mal la contraseña quedaría **deslogueado** por su propio error de tipeo. Es un bug que no se descubre con tests unitarios del interceptor: solo aparece componiendo.

Por eso la separación se declara acá como una decisión permanente y se protege con un test: ningún archivo de `src/features/auth/` importa de `@shared/api`.

**Alternativa descartada**: usar `fetch` nativo y no depender de axios. Evitaría la instancia, pero axios ya es la dependencia HTTP comprometida del proyecto (está en `package.json` y `tests/manifest.test.ts` la exige como dependencia de runtime), y tener dos clientes HTTP distintos en un frontend de este tamaño es peor que tener dos instancias del mismo.

**Alternativa descartada**: adelantar `axiosInstance.ts` en este change y hacerlo configurable (`withAuth: boolean`). Mueve scope de CHANGE-18 hacia acá y produce una abstracción con una bandera cuyo único propósito es apagar lo que la abstracción hace.

---

### D-3. ⚠️ CHECKPOINT — El `authStore` está en una capa que `features/` no puede importar

**Este es el hallazgo central del propose y requiere decisión del usuario antes de implementar.**

**El problema.** `useLogin` y `useRegister` tienen que llamar a `authStore.login(token, email)`. El store vive en `src/app/stores/authStore.ts`, capa **`app`**, índice 0 de `LAYER_ORDER`. Los hooks viven en capa **`features`**, índice 3. La regla —dura en `CLAUDE.md` y verificada por AST en `tests/fsd-boundaries.test.ts`— prohíbe que una capa importe de una anterior. Por lo tanto `import { useAuthStore } from '@app/stores/authStore'` dentro de `features/auth/` **hace fallar la suite**.

No es un tecnicismo evitable con otra ruta: el test resuelve también los imports relativos (`../../../app/stores/authStore` se normaliza y se detecta igual). Y no es un problema exclusivo de este change — con `LAYER_ORDER` tal como está, **ninguna** capa salvo `app/` puede leer ese store, lo que también rompe a CHANGE-19 (`ScanFormWidget` "lee `authStore.isAuthenticated`", capa `widgets`, índice 2) y a CHANGE-18 (`useScanForm` llama a `authStore.logout()`, capa `features`). Hoy el único importador es `src/app/App.tsx`, que está en `app/` y por eso la violación nunca se manifestó. Este change es simplemente el primero en toparse con ella.

**Recomendación (opción A): mover el store a `src/entities/user/model/authStore.ts` y exportarlo desde `entities/user/index.ts`.**

- Es la ubicación canónica en FSD para estado de dominio compartido entre features: el estado de sesión pertenece a la entidad usuario. `features → entities` es una dirección legal, igual que `widgets → entities` y `app → entities`.
- Blast radius acotado y enteramente mecánico: mover un archivo, agregar una línea de export en `entities/user/index.ts`, y actualizar cinco sitios de import (`src/app/App.tsx`, `tests/app-hydration.test.tsx`, `tests/auth-store.test.ts`, `tests/auth-store-selectors.test.tsx`, y los literales de ruta en `tests/storage-single-access-point.test.ts`). El comportamiento del store no cambia en una sola línea.
- Aserciones a actualizar: `structure.test.ts` (el inventario de `entities/user/` y el de `app/stores/`) y `storage-single-access-point.test.ts` (dos literales de ruta).
- **Costo real, y por eso es checkpoint**: roza una regla dura del proyecto, *"`entities/` solo define tipos y schemas Zod, sin lógica de UI"*. Un store Zustand no es lógica de UI —que es lo que la regla prohíbe— pero es más que tipos y schemas. Adoptar esta opción implica **enmendar esa regla en `CLAUDE.md`** a algo como *"`entities/` define tipos, schemas Zod y el estado de dominio; sin lógica de UI"*, y anotar la desviación respecto de `CHANGES.md`, que ubica el store en `app/stores/`. También afecta lo que afirma la spec archivada `auth-session-state` sobre la ruta del "punto único de acceso al almacenamiento".

**Alternativa B: inyectar la acción desde `app/` por props.** Los hooks reciben `onAuthenticated(token, email)` y nadie fuera de `app/` importa el store. Es FSD-puro y no mueve nada. **Descartada**: el único punto legal donde nace la inyección es `app/App.tsx`, así que `login`, `logout` e `isAuthenticated` habría que bajarlos por props a través de `pages → widgets → features` en cada consumidor. Es prop drilling de tres capas que además anula la razón de ser de Zustand, y encarece el contrato de todos los widgets de CHANGE-19.

**Alternativa C: excepcionar `app/stores/` en el test de fronteras.** Una línea en `tests/support/fsd.ts`. **Descartada**: cambia la regla más dura del proyecto por conveniencia, y una vez abierta la excepción no hay criterio para no abrirla de nuevo. Debilitar la regla estructural es peor que enmendar la regla descriptiva de `entities/`.

**Alternativa D: mover el store a `shared/`.** **Descartada de plano**: `shared/` no conoce el dominio WASA (regla dura), y un store de sesión de usuario es dominio puro.

**Si el usuario elige B o C**, la única parte del diseño que cambia es la firma de `useLogin`/`useRegister` (que pasan a recibir la acción) o nada, respectivamente; el resto de las decisiones de este documento queda intacto. Las tasks marcan este punto como bloqueante del grupo de implementación.

---

### D-4. El error que se lanza es una clase nueva, `AuthRequestError` — no el tipo `AuthApiError` de `entities/`

`CHANGES.md` dice "lanza `AuthApiError`". Pero `AuthApiError` ya existe en `entities/user/model/types.ts` y **es otra cosa**: es una `interface` que describe el *cuerpo* RFC 7807 que emite el Bridge (`type`, `title`, `status`, `detail`, `instance`). No es una `Error`, no se puede `throw` con `instanceof`, y no lleva mensaje para el usuario.

**Decisión**: `features/auth/lib/authErrors.ts` define

```ts
class AuthRequestError extends Error {
  readonly status: number | null   // null = nunca hubo respuesta (D-9)
  readonly problem: AuthApiError | null  // el cuerpo RFC 7807, si vino y tenía forma de tal
}
```

`AuthApiError` (el tipo de `entities/`) se **reutiliza tal cual** para tipar `problem`; no se redefine ni se renombra.

**Rationale**: dos cosas distintas con el mismo nombre en el mismo grafo de imports es la clase de ambigüedad que produce el import equivocado. El nombre nuevo dice lo que la cosa es: el error de una *request*, no el cuerpo de una *respuesta*. Además, `status: number | null` explícito le permite al hook decidir el mensaje sin volver a inspeccionar la excepción de axios, que es un detalle de la librería que no debería filtrarse al `model/`.

**Desviación de `CHANGES.md` a registrar**: el nombre. El comportamiento que el roadmap pide ("lanza un error si 401 / con status 409") se cumple exactamente.

---

### D-5. La traducción `status → mensaje` vive en `model/`, es por operación, y el genérico se declara una sola vez

- El módulo `api/` es **transporte puro**: lanza `AuthRequestError` con el `status` y el `problem`, sin decidir qué lee el usuario.
- El hook (`model/`) resuelve el mensaje, porque el mismo código de estado significa cosas distintas según la operación: **401** solo tiene lectura de producto en el login ("Credenciales incorrectas."); **409** solo la tiene en el registro ("Este email ya está registrado.").
- `features/auth/lib/authMessages.ts` declara el mensaje genérico **una vez** y expone la función que combina el mapa específico de la operación con ese fallback.

Mensajes fijados por este change (criterios de aceptación de `CHANGES.md`, HU-06-02/HU-06-03):

| Situación | Mensaje |
|---|---|
| Login, 401 | `Credenciales incorrectas.` |
| Registro, 409 | `Este email ya está registrado.` |
| Cualquier otro fallo (400, 422, 500, 502, red caída, timeout) | `No pudimos completar la operación. Intentá de nuevo en unos minutos.` |

**Rationale**: poner el mapa en `api/` obligaría a que el módulo de transporte conozca la copy del producto; ponerlo en `ui/` lo dejaría fuera del alcance de los tests del hook, que es donde se decide. El fallback compartido evita tres literales que dicen casi lo mismo.

---

### D-6. El `detail` que emite el Bridge nunca se le muestra al usuario

**Decisión**: `serverError` siempre es uno de los literales de D-5. El `problem.detail` se conserva en el objeto de error (para un futuro consumidor, p. ej. telemetría) pero **no se renderiza**.

**Rationale**: los `detail` del Bridge no están escritos para un usuario final. El de un 422 se compone con nombres de campo y mensajes de Pydantic (`password: String should have at least 8 characters`) — inglés, técnico, y con la forma del backend. El de un 500 es deliberadamente opaco. El de un 409 interpola el email (`El email 'x@y.com' ya está registrado.`), que es correcto pero redundante frente al mensaje fijo. Renderizar `detail` haría que la copy de la UI dependiera de un string del servidor que nadie revisa como copy.

**Trade-off aceptado**: ante un 422 el usuario ve el mensaje genérico y no sabe qué campo falló. Es aceptable porque un 422 en estos dos endpoints **no debería ocurrir**: los schemas Zod del cliente son espejo verificado de los Pydantic del Bridge (`tests/auth-schemas-parity.test.ts`, CHANGE-14 D-7), así que un 422 significa una divergencia entre cliente y servidor —un bug— y no un error del usuario. Ver R-5.

---

### D-7. Nada de esta slice loguea nunca

**Decisión**: ningún módulo de `features/auth/` llama a `console.log`, `console.error`, `console.warn` ni equivalente. Ni siquiera en la rama de error.

**Rationale**: es exactamente el borde donde la contraseña en texto plano está en memoria y en el cuerpo de la request. Un `console.error(error)` sobre una `AxiosError` imprime `error.config.data` — es decir, **el cuerpo enviado, con la contraseña**— en la consola del navegador y en cualquier herramienta de captura de errores que enganche `console`. Es el espejo exacto de D-11 de CHANGE-05, que prohibió logging en el router de auth del Bridge por el mismo motivo. Se protege con un test que recorre los archivos de la slice.

---

### D-8. `confirmPassword` nunca sale del navegador, y el cuerpo se proyecta explícitamente

**Decisión**: `registerApi` recibe los valores validados y construye el cuerpo campo por campo como `UserRegisterRequest` (`{ email, password }`), nunca con un spread (`{ ...values }`) ni con `delete`.

**Rationale**: dos razones, una inmediata y una que importa más. La inmediata: el modelo Pydantic del Bridge usa `extra="forbid"`, así que un `confirmPassword` en el cuerpo produce un 422. La que importa más: una proyección explícita no puede empezar a mandar en silencio un campo que alguien agregue al formulario el mes que viene. Un spread sí. En una superficie por la que viajan credenciales, la lista de lo que se envía debe ser una allowlist escrita a mano — el mismo criterio que `_format_validation_detail` aplicó del lado del Bridge (CHANGE-07 D-7).

---

### D-9. Orden en el éxito: primero la sesión, después el aviso al contenedor — y se guarda el email *parseado*

**Decisión**: en el camino feliz el hook hace, en este orden: (1) `login(token, email)` sobre el store; (2) `onSuccess()`. Y el `email` que se guarda es el que devolvió el parseo de Zod (ya con `.trim()` aplicado), no el string crudo del input.

**Rationale del orden**: `onSuccess()` es lo que CHANGE-19 usa para cerrar el modal, y el `Modal` de CHANGE-15 **desmonta** sus children al cerrarse (D-11 de ese change). Si `onSuccess()` corriera primero, la actualización del store saldría de un componente que se está desmontando, y el instante en que `isAuthenticated` pasa a `true` quedaría dependiendo del batching de React. Con este orden, en el commit en que el modal se cierra la aplicación **ya** está autenticada, que es justo lo que `ScanFormWidget` necesita para renderizar el formulario sin un frame intermedio mostrando el muro.

**Rationale del email parseado**: `loginSchema`/`registerSchema` aplican `.trim()` al email (D-11 de CHANGE-14). El store guarda el email para mostrarlo en la UI; guardar el crudo dejaría un `" ana@wasa.dev "` visible y distinto del que se envió al Bridge.

---

### D-10. `isSubmitting` sale de React Hook Form, no de un `useState` paralelo

**Decisión**: el estado de envío que expone el hook es `formState.isSubmitting` de RHF, expuesto con ese nombre. `CHANGES.md` lo llama `isLoading`; se registra la desviación de nombre.

**Rationale**: RHF ya mantiene `isSubmitting` en `true` durante toda la promesa que devuelve el callback de `handleSubmit`. Un `useState` propio sería una segunda fuente de verdad del mismo hecho, y las dos fuentes se desincronizan en la primera rama que retorna temprano sin acordarse de bajar la bandera. El nombre se conserva tal cual sale de RHF para que quien lea el hook sepa de dónde viene, en vez de buscar un `setIsLoading` que no existe.

---

### D-11. `serverError` se limpia al comienzo de cada envío

**Decisión**: la primera línea del submit handler borra el `serverError` anterior.

**Rationale**: sin eso, un "Credenciales incorrectas." queda colgado debajo de un formulario que el usuario ya corrigió, y durante el segundo intento conviven un spinner ("estoy trabajando") y un mensaje de fallo ("ya falló"). El estado visible tiene que corresponder al intento en curso, no al anterior.

---

### D-12. El doble submit se impide estructuralmente, con dos guardas independientes

**Decisión**: el botón recibe `loading={isSubmitting}`, y `Button` con `loading` ya setea `disabled` a nivel DOM (CHANGE-15 D-10). Además, `handleSubmit` de RHF ignora invocaciones reentrantes mientras `isSubmitting` es `true`.

**Rationale**: dos guardas de mecanismos distintos (una en el DOM, otra en la librería de formularios) y ninguna que dependa de que alguien se acuerde de chequear una bandera. El test asserta el hecho observable —dos clicks producen **una** request— no la presencia del atributo.

---

### D-13. Los formularios no saben que existe un modal

**Decisión**: `LoginForm` recibe `onSuccess: () => void` y `onSwitchToRegister: () => void`; `RegisterForm` recibe `onSuccess` y `onSwitchToLogin`. Ninguno importa `Modal`, ninguno llama a nada llamado `onClose`, ninguno decide navegación.

**Rationale**: CHANGE-19 es el dueño del par de modales y del alternado entre ellos. Un formulario que cerrara su propio modal sería inusable en cualquier otro contenedor —una página `/login` propia, por ejemplo— y ataría la slice `features` a una decisión de composición que pertenece a `widgets`. El link de alternado es un `<button type="button">` estilado como link, no un `<a href>`: no navega a ninguna parte, y un `<a>` sin destino real es un enlace roto para un lector de pantalla.

---

### D-14. Un fallo sin respuesta se distingue en el dato aunque no en la copy

**Decisión**: cuando axios reporta un error sin `response` (red caída, DNS, timeout, CORS), `AuthRequestError` se construye con `status: null` y `problem: null`. El mensaje que ve el usuario es el genérico de D-5, el mismo que ante un 500.

**Rationale**: distinguir "el servidor no contesta" de "el servidor falló" en la copy es una decisión de producto que nadie tomó, y adivinarla acá agregaría un literal que después hay que mantener. Pero perder el dato sería irreversible: preservar `status: null` deja la puerta abierta a que un change futuro (o telemetría) diferencie sin volver a tocar el transporte.

---

### D-15. La respuesta 2xx se acepta por su estado, no se re-parsea con Zod

**Decisión**: `TokenResponse` se **tipa**, no se valida en runtime. `loginApi` devuelve `response.data as TokenResponse` tras confirmar el estado exitoso.

**Rationale**: es la continuación explícita de D-10 de CHANGE-14, que decidió que `TokenResponse` y `AuthApiError` fueran tipos y no schemas, dejando la eventual validación de runtime como pregunta abierta para más adelante. Reabrirla acá agregaría un schema Zod que el roadmap no pide y que tendría que mantenerse en paridad con un contrato que ya está verificado del lado del Bridge. Lo que sí se verifica es la forma del **error**: `problem` solo se puebla si el cuerpo recibido tiene efectivamente forma de RFC 7807 (chequeo de forma, no schema), y si no, queda `null` — un `detail` inventado a partir de un cuerpo HTML de un proxy sería peor que ninguno.

---

### D-16. Los tests de los módulos `api/` stubean el entorno; no dependen del `.env` del disco

**Decisión**: los tests que importan `loginApi`/`registerApi` usan el patrón que ya fijó `tests/env.test.ts`: `vi.stubEnv('VITE_API_BASE_URL', ...)` + `vi.resetModules()` + `await import(...)` dinámico.

**Rationale**: `authHttp.ts` importa `@shared/config/env`, que **lanza al cargar el módulo** si falta la variable. `wasa-landing/.env` existe en esta máquina pero está en `.gitignore`: en un clon limpio o en CI sin `.env`, todo test que importe estáticamente la slice fallaría en el import con un error que no menciona el test. El import dinámico con el entorno stubeado hace que la suite sea autosuficiente.

---

### D-17. Aserciones existentes que este change actualiza (y las que no)

**Se actualizan** (el change las invalida legítimamente, igual que CHANGE-14/15 hicieron con las suyas):

- `tests/structure.test.ts`: la aserción "`src/features` contiene solo `.gitkeep`" se reemplaza por el inventario real de la slice `auth`; se elimina `src/features/.gitkeep`.
- Si se adopta D-3 opción A: en el mismo archivo, los inventarios de `src/app/stores/` y `src/entities/user/`; y en `tests/storage-single-access-point.test.ts`, los dos literales de ruta del store.

**No se tocan**: `fsd-boundaries.test.ts`, `shared-domain-agnostic.test.ts`, `manifest.test.ts`, ni ningún test de CHANGE-13/14/15. Si alguno de ellos se pone en rojo, es una señal de que el diseño está mal, no de que el test esté viejo.

**Se agregan** dos tests estructurales propios de esta slice: que ningún archivo de `features/auth/` importe de `@shared/api` (protege D-2) y que ninguno llame a `console.*` (protege D-7).

## Risks / Trade-offs

- **R-1 — La reubicación del `authStore` (D-3 opción A) toca la salida de un change ya archivado.** → Mitigación: el movimiento es puramente de ubicación (cero cambios de comportamiento) y la suite de CHANGE-13 (`auth-store.test.ts`, `auth-store-selectors.test.tsx`, `app-hydration.test.tsx`) se corre intacta salvo la línea de import: si sigue verde, el store es el mismo. Además la decisión es un checkpoint explícito del usuario, no una iniciativa del apply. Si se rechaza, se implementa la alternativa B con el costo documentado.
- **R-2 — CHANGE-18 podría "unificar" después esta slice bajo su `axiosInstance` y reintroducir el bug del logout por login fallido (D-2).** → Mitigación: el test estructural que prohíbe importar `@shared/api` desde `features/auth/` falla en el momento exacto en que alguien lo intente, con el motivo escrito al lado.
- **R-3 — La contraseña en texto plano vive en memoria mientras el formulario está montado.** Es inevitable en un login de navegador. → Mitigación por acumulación: no se loguea nada (D-7), no se persiste nada (el único módulo que toca almacenamiento sigue siendo el store, y solo guarda token y email), y el `Modal` de CHANGE-15 desmonta sus children al cerrar, así que el estado del formulario se descarta al cerrar el modal en vez de quedar vivo detrás de un `display: none`.
- **R-4 — El 401 de auth y el 401 de scan significan cosas distintas y comparten código de estado.** → Mitigación: son clientes HTTP distintos, con instancias distintas y sin interceptores compartidos (D-2). La distinción es estructural, no una convención que alguien deba recordar.
- **R-5 — Un 422 se le muestra al usuario como un fallo genérico e inaccionable (D-6).** → Mitigación: la paridad cliente/servidor está verificada por `tests/auth-schemas-parity.test.ts`, así que un 422 es un bug de divergencia, no un flujo de usuario. Si aparece en producción, el `status` y el `problem` quedan en el objeto de error para diagnóstico. Alternativa evaluada y descartada: mapear los campos del `detail` del Bridge a errores por campo — acopla el cliente al formato del string de error del servidor, que no es un contrato.
- **R-6 — Un cambio del prefijo de la API (`/api/v1`) requiere tocar dos módulos** (`loginApi`, `registerApi`). → Mitigación: la ruta base y el prefijo de versión se declaran una sola vez en `authHttp.ts`; los dos módulos aportan solo el segmento final (`/login`, `/register`).
- **R-7 — El `Input` de CHANGE-15 se estrena acá bajo React Hook Form.** Si el reenvío de `ref`/props nativas no se comporta como CHANGE-15 previó (su D-x lo diseñó para RHF pero nunca lo ejercitó con RHF real), aparecería recién en este apply. → Mitigación: el primer grupo de tasks del formulario es exactamente esa integración, y si falla, se corrige en `shared/ui/Input.tsx` como defecto de CHANGE-15 —registrando la desviación— en vez de envolverlo con un `Controller` que esconda el problema.

## Migration Plan

No hay migración de datos ni despliegue coordinado: es frontend puro, sin cambios de contrato con el Bridge. La secuencia de implementación (detallada en `tasks.md`) es:

1. **Checkpoint D-3 cerrado con el usuario: opción A adoptada** (ver Open Questions).
2. Baseline de la suite existente (`npm run test:run`), registrado. Ese número no puede bajar en ningún momento.
3. Mover el store a `entities/user/model/authStore.ts` y actualizar imports y aserciones; la suite vuelve a verde **antes** de escribir una línea de la slice nueva.
4. Slice `auth`: `lib/` → `api/` → `model/` → `ui/`, cada unidad por ciclo TDD.
5. Actualización de `structure.test.ts` y borrado de `src/features/.gitkeep`.
6. Verificación final: `npm run test:run`, `npm run build` (`tsc -b` incluido) y `npm run lint` en verde.

**Rollback**: revertir el commit. La slice es aditiva y sus únicos cambios sobre archivos existentes son de tests y, si se adopta D-3/A, el movimiento del store — todo reversible sin estado que migrar hacia atrás.

## Open Questions — resueltas (checkpoint 2026-08-23)

1. **D-3 → adoptada opción A.** Se mueve `authStore` a `src/entities/user/model/authStore.ts`, exportado desde `entities/user/index.ts`. `CLAUDE.md` (regla FSD) fue enmendado para reflejar que `entities/` también aloja estado de dominio compartido entre features, no solo tipos y schemas Zod. Las alternativas B y C quedan descartadas.
2. **Mensaje genérico de fallo → aprobado tal como se propuso**: *"No pudimos completar la operación. Intentá de nuevo en unos minutos."*
3. **Timeout explícito en axios → aprobado**: se implementa (≈15s) por el camino de D-14 (`status: null` → mensaje genérico).
