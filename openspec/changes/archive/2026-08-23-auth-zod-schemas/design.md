## Context

**Governance: BAJO (LOW)** — `CHANGES.md` clasifica CHANGE-14 como BAJO: tipos y schemas de validación, sin I/O, sin UI, sin estado. Plena autonomía si los tests pasan; no hay checkpoint de decisiones con el usuario. Las decisiones de abajo se documentan para que queden auditables, no porque bloqueen el `apply`.

Estado real del repo verificado antes de diseñar:

- El frontend vive en `wasa-landing/` (Vite + React 19 + TS + Tailwind 4). `src/entities/` existe pero está **vacío**: solo tiene un `.gitkeep` anotado. Este change es el primero que puebla la capa `entities`.
- `zod@3.25.76` ya está instalado (junto con `react-hook-form@7.86` y `@hookform/resolvers@5.9`), así que este change **no agrega dependencias**. La versión importa: es la API clásica de Zod v3 (`z.string().email()`, `.superRefine`), no la de v4.
- El test runner es **Vitest 4** (`npm test` / `npm run test:run`), con `environment: 'jsdom'`, `globals: true` y `include: ['tests/**/*.test.{ts,tsx}']`. Los tests viven en `wasa-landing/tests/`, fuera de `src/`.
- Los alias `@entities/*`, `@shared/*`, etc. están configurados en `vite.config.ts` **y** en `tsconfig.app.json`.
- `tests/fsd-boundaries.test.ts` verifica automáticamente que ningún módulo importe de una capa anterior en `app → pages → widgets → features → entities → shared`. Los módulos nuevos quedan cubiertos por ese test sin agregar nada.
- `tests/structure.test.ts` afirma hoy que `src/entities`, `src/features`, `src/shared/ui` y `src/shared/api` **contienen solo `.gitkeep`** (aserción escrita en CHANGE-13 para que cada pieza de dominio aparezca en el change que la implementa). Esa aserción **caduca con este change** y hay que actualizarla; también verifica que todo `.gitkeep` bajo `src/` tenga un comentario no vacío.
- El contrato del backend ya está implementado y archivado: `fastapi_bridge/schemas/auth_schemas.py` (CHANGE-02) y `fastapi_bridge/schemas/error_schemas.py`.

El contrato del Bridge, tal como está hoy en el código (no en el roadmap):

| Backend | Regla |
|---------|-------|
| `UserRegister.email` | `EmailStr` |
| `UserRegister.password` | `min_length=8` (`REGISTER_PASSWORD_MIN_LENGTH`) + validador de **72 bytes UTF-8** (`_BCRYPT_MAX_PASSWORD_BYTES`), `repr=False` |
| `UserLogin.password` | `min_length=1` + el **mismo** techo de 72 bytes (alias compartido `PasswordWithByteCeiling`) |
| Ambos | `model_config = ConfigDict(extra="forbid")` |
| `TokenResponse` | `access_token: str`, `token_type: Literal["bearer"] = "bearer"`, `expires_in: int > 0` (segundos) |
| `ErrorDetail` | `type` (default `"about:blank"`), `title`, `status` (100..599), `detail: str \| None = None`, `instance` |
| `UserRepository` | normaliza el email con `email.strip().lower()` en `create` **y** en `get_by_email` |

El techo de 72 bytes viene de **D-2 de CHANGE-02**: bcrypt ≥ 4.1 lanza `ValueError` por encima de 72 bytes en vez de truncar, así que sin el tope una contraseña larga produce un 500 en vez de un 422. Aquel design deja escrito, en la consecuencia de D-2 y en su riesgo R-2, que **CHANGE-14 debe replicarlo**; si no, el formulario acepta una contraseña que el Bridge rechaza con un 422 sin explicación bajo ningún campo.

Comportamientos de Zod v3 verificados empíricamente contra la versión instalada, porque el diseño depende de ellos:

1. Un `.superRefine` sobre el objeto **sí se ejecuta aunque un campo haya fallado**: con `password: "1234567"` y confirmación distinta, el `ZodError` trae los dos issues (`too_small` en `password` y el `custom` en `confirmPassword`), no solo el primero. El formulario puede mostrar ambos mensajes en la misma pasada.
2. Un `.refine` **de campo** sí se saltea si el check anterior de ese mismo campo falló (con 7 caracteres se reporta `too_small`, no también el de bytes) — deseable: un solo mensaje por campo.
3. Por defecto, un objeto Zod **descarta** las claves desconocidas en la salida de `parse` sin reportar error; `.strict()` las reporta como `unrecognized_keys` con `path: []` (error de formulario, sin campo asociado).
4. `"🔒".repeat(19)` tiene `.length === 38` y **76 bytes UTF-8**: la diferencia entre medir caracteres y medir bytes es material, no teórica.

## Goals / Non-Goals

**Goals:**

- Fijar la forma de los datos de autenticación del cliente en un único lugar, antes de que exista el primer formulario que los use (CHANGE-16/17) y el primer cliente HTTP que los envíe (CHANGE-18).
- Replicar **exactamente** la política de contraseña del Bridge —mínimo 8 caracteres y techo de 72 bytes UTF-8 medidos en bytes— y dejar esa paridad verificada por un test, no por un comentario.
- Impedir por tipos que `confirmPassword` llegue a un endpoint con `extra="forbid"`.
- Mantener `entities/user` como modelo puro: sin React, sin red, sin `localStorage`, ejecutable fuera del navegador.

**Non-Goals:**

- Componentes de formulario, `react-hook-form`, `zodResolver`, modales, spinners (CHANGE-16/17).
- Cliente HTTP, interceptores, manejo de 401/409/422 y traducción de `AuthApiError` a mensajes visibles (CHANGE-18/19).
- Validar en runtime la respuesta del Bridge: `TokenResponse` y `AuthApiError` son **tipos**, no schemas de parseo (ver D-10).
- Reglas de complejidad de contraseña (mayúscula, dígito, símbolo): el Bridge no las tiene (D-4 de CHANGE-02) y agregarlas del lado del cliente rompería la paridad.
- Normalizar el email a minúsculas en el cliente (ver D-11).

## Decisions

### D-1 — El techo de 72 bytes se mide con `TextEncoder`, nunca con `.length`

`utf8ByteLength(value) = new TextEncoder().encode(value).length`, y la regla es `utf8ByteLength(password) <= 72`.

*Por qué*: `String.prototype.length` cuenta unidades de código UTF-16. Una contraseña de 19 emojis tiene `.length === 38` y **76 bytes** — pasaría un `.max(72)` y reventaría en bcrypt del otro lado, que es exactamente el 422 opaco que este change existe para evitar. `TextEncoder` es global en el navegador, en Node y en jsdom (el entorno de Vitest), así que no hace falta polyfill ni dependencia.

*Alternativa descartada*: `z.string().max(72)`. Es el error por defecto: parece paridad y no lo es. Solo coincide con el backend en el subconjunto ASCII.

*Alternativa descartada*: `Buffer.byteLength(value, 'utf8')`. Correcto en Node, inexistente en el navegador; obligaría a un polyfill de Node en el bundle del cliente.

### D-2 — La política de contraseña vive en `model/passwordRules.ts`, compartida por ambos schemas

Módulo nuevo con `PASSWORD_MIN_LENGTH = 8`, `PASSWORD_MAX_BYTES = 72`, `utf8ByteLength()` y el schema base de contraseña con el techo aplicado. `loginSchema` y `registerSchema` lo consumen; ninguno repite los números.

*Por qué*: es el espejo exacto del alias `PasswordWithByteCeiling` del backend, que existe por la misma razón — el techo es idéntico en registro y en login, el mínimo no. Con los números literales dispersos en dos archivos, actualizar la política significa acordarse de dos lugares, y el que se olvida no falla: acepta de más.

*Desviación del roadmap, deliberada*: `CHANGES.md` lista tres archivos (`types.ts`, `loginSchema.ts`, `registerSchema.ts`). Este es un cuarto. El costo es un archivo más; el beneficio es que la constante que este change existe para replicar tenga **una** definición. La alternativa sin archivo nuevo sería que `registerSchema` importe de `loginSchema` (un módulo de dominio importando a un par por una constante compartida: peor) o que las constantes vivan en `types.ts` (que la regla del proyecto reserva para tipos, sin runtime).

### D-3 — El techo de 72 bytes también rige en el login; el mínimo de 8, no

`loginSchema.password`: `.min(1)` + techo de 72 bytes. `registerSchema.password`: `.min(8)` + el mismo techo.

*Por qué el techo en el login*: el Bridge lo aplica en `UserLogin` también. Sin él, una contraseña larga escrita en el login sale como 422 en vez de como mensaje bajo el campo — el mismo problema, en el otro formulario.

*Por qué el mínimo NO en el login*: es paridad literal con D-3 de CHANGE-02, y la razón es de seguridad, no de simetría. Un "la contraseña debe tener 8 caracteres" en el login (a) le confirma a quien prueba credenciales cuál es la política vigente, y (b) dejaría fuera a cualquier cuenta creada bajo una política anterior más laxa, sin poder autenticarse ni siquiera para cambiarla. La validación de longitud pertenece al registro.

*Alternativa descartada*: unificar ambos schemas "porque son casi iguales". Es el refactor que romperá esto en el futuro; por eso la asimetría tiene un test propio con el porqué escrito al lado.

### D-4 — La discrepancia de confirmación se reporta sobre `confirmPassword`

`.superRefine((values, ctx) => { if (values.password !== values.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Las contraseñas no coinciden.' }) })`.

*Por qué `path: ['confirmPassword']`*: sin `path`, el issue queda con `path: []` — un error del formulario entero, que `react-hook-form` no puede asociar a ningún control y que el formulario tendría que renderizar suelto, lejos del campo que el usuario debe corregir. Y el campo a corregir es la confirmación, no la contraseña.

*Verificado (Zod v3)*: el `superRefine` corre aunque `password` haya fallado su propio check, así que un formulario con contraseña corta **y** confirmación distinta muestra los dos errores a la vez, en la misma pasada.

### D-5 — Sin `.strict()`: se aprovecha el descarte por defecto de Zod

Ninguno de los dos schemas lleva `.strict()`.

*Por qué*: el objetivo de `extra="forbid"` del backend es que nada desconocido entre. En el cliente, el comportamiento por defecto de Zod ya lo garantiza *hacia el Bridge*: `parse` **devuelve un objeto nuevo con las claves desconocidas descartadas**, así que lo que se envía sale limpio. `.strict()` no agregaría seguridad, agregaría un `unrecognized_keys` con `path: []` — un error sin campo asociado, imposible de mostrar bajo un control, disparado por algo que el usuario no escribió y no puede arreglar.

*Alternativa descartada*: `.strict()` "por paridad con `extra="forbid"`". La paridad que importa es la del payload emitido, no la del modo de fallo ante un campo que solo un bug del propio frontend podría introducir.

### D-6 — Los tipos se escriben a mano y un guard de tipo los ata a los schemas

`types.ts` declara `UserRegister`, `UserLogin`, `TokenResponse`, `AuthApiError` y `UserRegisterRequest` a mano (como pide el roadmap). Cada módulo de schema agrega una aserción **de tipo** que falla en compilación si el schema y el tipo se separan:

```ts
type Assert<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export type _RegisterSchemaMatchesType = Assert<Equals<z.infer<typeof registerSchema>, UserRegister>>
```

*Corrección durante `apply` (2026-08-23)*: la rama negativa de `Equals` resuelve a `false`, no a `never` como en un borrador anterior de este documento. `never` es el tipo inferior de TypeScript y satisface trivialmente cualquier restricción genérica (`T extends true`), así que un `Equals` que devolviera `never` en el mismatch dejaba pasar sin error tanto un campo de más como uno de menos o de otro tipo — se verificó empíricamente con `tsc --noEmit --strict` sobre los tres casos antes de corregirlo. Con `false`, `Assert<false>` sí es un error de `tsc` (`Type 'false' does not satisfy the constraint 'true'`), que es el efecto que este guard existe para producir.

*Por qué a mano y no `z.infer` como fuente de verdad*: los formularios necesitan el tipo **antes** del parseo (los valores por defecto y el estado de `react-hook-form` son la entrada, no la salida), y un tipo con nombre propio se lee mejor en las firmas que `z.infer<typeof registerSchema>` repetido. Además el roadmap fija `types.ts` como el lugar donde vive la forma.

*Por qué el guard y no un comentario*: dos declaraciones de la misma forma divergen; la aserción convierte esa divergencia en un error de `tsc`. Se declara como **tipo exportado** (no como `const`) a propósito: `tsconfig.app.json` tiene `noUnusedLocals: true`, que se quejaría de una constante testigo sin usar.

*Por qué no anotar el schema con `z.ZodType<UserRegister>`*: esa anotación degrada la inferencia de Zod y desactiva el chequeo en el sentido útil (dejaría pasar un schema que valida de menos).

### D-7 — La paridad con el backend se verifica leyendo el módulo Python, no repitiendo el número

Un test de Vitest lee `fastapi_bridge/schemas/auth_schemas.py` (mismo repo, ruta relativa a `wasa-landing/`), extrae por expresión regular `REGISTER_PASSWORD_MIN_LENGTH = 8` y `_BCRYPT_MAX_PASSWORD_BYTES = 72`, y los compara con `PASSWORD_MIN_LENGTH` y `PASSWORD_MAX_BYTES` del frontend.

*Por qué*: es el único mecanismo que hace fallar el cambio **unilateral** de la política. Un test que afirme `expect(PASSWORD_MAX_BYTES).toBe(72)` solo repite el literal una tercera vez: si el backend sube el techo, el frontend sigue verde y desincronizado, que es precisamente R-2 de CHANGE-02.

*Modo de fallo elegido*: si el archivo no existe o la expresión regular no encuentra la constante, el test **falla con un mensaje que nombra la constante que no pudo leer**, en vez de saltearse. Un chequeo de paridad que se auto-desactiva cuando el backend se renombra es peor que no tenerlo: da una sensación de cobertura que ya no existe.

*Trade-off asumido*: el test acopla el frontend al nombre de dos constantes del backend. Es un acoplamiento barato (dos identificadores, en el mismo repo, en un test) y es exactamente el que se quiere: si alguien renombra la constante, tiene que mirar este test y decidir conscientemente.

### D-8 — La slice expone su contrato por `entities/user/index.ts`

Los formularios importan `@entities/user`, no `@entities/user/model/registerSchema`.

*Por qué*: es la regla de "public API" de FSD y la que mantiene el reacomodo interno de la slice como un cambio local. También hace que el import de un consumidor se lea como lo que es (el modelo de usuario) y no como un recorrido por el árbol de archivos.

### D-9 — `tests/structure.test.ts` se actualiza en este change, no se relaja

La aserción "`src/entities` contiene solo `.gitkeep`" pasa a describir el contenido esperado de la slice: los archivos de `entities/user/`. `src/entities/.gitkeep` se elimina (la capa ya no está vacía); `src/features`, `src/shared/ui` y `src/shared/api` mantienen su aserción intacta.

*Por qué actualizar en vez de borrar el test*: fue escrito en CHANGE-13 justamente para que cada pieza de dominio aparezca en el change que la implementa. Borrarlo dejaría a los tres directorios restantes sin esa red. Actualizarlo con la lista concreta de módulos hace que el próximo archivo que alguien agregue a la slice sea una decisión visible, no un descuido.

### D-10 — `TokenResponse` y `AuthApiError` son tipos, sin validación en runtime

No se declara ningún `tokenResponseSchema` ni `authApiErrorSchema`.

*Por qué*: el roadmap los pide como tipos, y el punto donde tendría sentido parsear una respuesta —con su decisión sobre qué hacer si el Bridge devuelve algo inesperado— es el cliente HTTP de CHANGE-18. Declarar acá un schema que nadie ejecuta es peso muerto que sugiere una garantía inexistente.

*Formas exactas*: `token_type` se tipa `'bearer'` (literal, no `string`), espejo del `Literal["bearer"]` del Bridge; `expires_in` está en **segundos**; `detail` se tipa `string | null` porque el Bridge siempre emite la clave y su valor puede ser nulo (`model_dump()` de un `ErrorDetail` sin detalle), no porque la clave pueda faltar.

### D-11 — El email se recorta (`trim`) pero no se pasa a minúsculas

`z.string().trim().email(...)`.

*Por qué `trim`*: el `UserRepository` del Bridge normaliza con `email.strip().lower()`, así que un email pegado con un espacio final es válido para el backend. Sin `trim`, el formulario lo rechazaría por "email inválido" un error que el usuario no puede ver ni entender.

*Por qué NO `toLowerCase`*: el Bridge ya normaliza a minúsculas en `create` **y** en `get_by_email` (con la misma función, así que el login de un email escrito con mayúsculas funciona). Pasarlo a minúsculas también acá duplicaría la responsabilidad y alteraría en silencio lo que el usuario escribió.

*Explícitamente NO se recorta la contraseña*: un espacio al principio o al final es un carácter legítimo de una contraseña, y el Bridge no lo recorta. Recortarlo acá haría que una contraseña válida en el registro no sirva para iniciar sesión desde otro cliente.

### D-12 — Los mensajes de validación se escriben en español

Cada regla lleva su mensaje explícito ("Ingresá un email válido.", "La contraseña debe tener al menos 8 caracteres.", "La contraseña no puede superar los 72 bytes.", "Las contraseñas no coinciden.").

*Por qué*: estos mensajes se muestran tal cual bajo el campo en CHANGE-16/17, junto a los que la KB ya fija en español ("Este email ya está registrado.", "Credenciales incorrectas."). Los mensajes por defecto de Zod están en inglés; dejarlos produciría un formulario mitad en inglés y mitad en español, y obligaría a CHANGE-16 a traducirlos por código de issue.

## Risks / Trade-offs

- **R-1 — El techo de 72 bytes se le explica mal al usuario** → "72 bytes" no significa nada para quien escribe una contraseña con emojis y ve el mensaje. Mitigación: el mensaje habla de bytes pero el caso real (más de 72 caracteres ASCII) es infrecuente y el límite es el del algoritmo, no una elección de producto. Si CHANGE-16 encuentra el mensaje confuso, cambia el texto, no la regla: la regla es paridad con bcrypt.
- **R-2 — El test de paridad se rompe si el backend renombra sus constantes** → Falla ruidosamente y nombra la constante que no encontró (D-7). Es el modo de fallo deseado: obliga a mirar la paridad, en lugar de dejarla degradar en silencio.
- **R-3 — Los tipos escritos a mano se separan de los schemas** → Mitigado por el guard de tipo de D-6, que lo convierte en un error de `tsc -b` (que ya corre en `npm run build`).
- **R-4 — `.trim()` en el email cambia el valor que se envía respecto del que se ve escrito** → Es el mismo valor que el Bridge habría guardado (`strip()`), así que no introduce divergencia; el usuario no percibe la diferencia y evita un rechazo incomprensible.
- **R-5 — La forma de `AuthApiError` se cree verificada y no lo está** → Es un tipo: si el Bridge cambiara el cuerpo del error, TypeScript no lo notaría. Mitigación: `error-contract` está fijado por spec y por tests del backend, y el punto de parseo real llega en CHANGE-18; se acepta a conciencia (D-10).
- **Trade-off aceptado** — este change no produce nada visible: no hay formulario que ejecute estos schemas hasta CHANGE-16. Se acepta por la misma razón que en CHANGE-02: definir el contrato después de tener dos consumidores cuesta bastante más que definirlo antes.

## Open Questions

Ninguna bloquea el `apply`.

1. **(para CHANGE-16/17)** ¿El mensaje del techo de contraseña se muestra tal cual o se reformula en términos de caracteres? Ver R-1. Decisión de copy, no de regla.
2. **(para CHANGE-18)** ¿El cliente HTTP parsea la respuesta del Bridge con un schema Zod o confía en el tipo? Este change deja deliberadamente esa decisión abierta (D-10).
