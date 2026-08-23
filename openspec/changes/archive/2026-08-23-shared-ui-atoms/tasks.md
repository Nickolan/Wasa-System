> **Modo TDD estricto activo.** Cada grupo marcado `(TDD)` sigue el ciclo
> RED → GREEN → TRIANGULATE → REFACTOR. No se escribe código de producción sin un
> test que falle primero. El grupo 1 es instalación de dependencias (no hay ciclo TDD
> posible sobre `npm install`) y el grupo 9 es verificación final.
>
> **Safety net**: este change no modifica ningún archivo existente salvo `package.json`.
> Antes de empezar, correr `npm run test:run` y registrar el baseline de tests verdes
> de CHANGE-00b; ese número no puede bajar en ningún momento.
>
> Todos los comandos se ejecutan desde `wasa-landing/` salvo indicación contraria.
>
> Referencias: `design.md` (decisiones D-1..D-16, riesgos R-1..R-6),
> `specs/shared-ui-kit/spec.md` y `specs/shared-client-utils/spec.md`
> (requirements y escenarios = criterios de aceptación).

## 1. Dependencias y baseline

- [x] 1.1 Correr `npm run test:run` y registrar el baseline de tests verdes heredado de CHANGE-00b. Si algún test ya falla, **detenerse** y reportarlo como fallo preexistente (no arreglarlo dentro de este change)
  - Baseline: **13 test files, 137 tests, all passing.**
- [x] 1.2 Instalar `clsx` y `tailwind-merge` como **dependencias de runtime** (D-1): `npm install clsx tailwind-merge`. Verificar que quedan en `dependencies` y no en `devDependencies`
  - Confirmado en `package.json`: ambas en `dependencies`, ninguna en `devDependencies`.
- [x] 1.3 Verificar que la versión instalada de `tailwind-merge` es la línea alineada con Tailwind CSS v4 (3.x al momento de proponer; ver D-1 y R-2). Si el registry entrega una major distinta, confirmar en su changelog que declara soporte de Tailwind v4 y **registrar la desviación** en este archivo
  - `clsx@^2.1.1`, `tailwind-merge@^3.6.0` — exactamente la línea que D-1 predijo (`clsx@^2.1`, `tailwind-merge@^3.6`). **Sin desviación.**
- [x] 1.4 Correr `npm run test:run` de nuevo: el baseline sigue verde después de la instalación (`tests/manifest.test.ts` incluido)
  - 13 test files, 137 tests, all passing tras la instalación.

## 2. `cn()` — merge de clases Tailwind (TDD)

> Spec: `shared-client-utils` → Requirement "cn() fusiona clases Tailwind resolviendo conflictos"

- [x] 2.1 **RED**: crear `tests/shared-lib-cn.test.ts` con el caso de concatenación simple (`cn("px-4", "font-medium")` contiene ambas). Importar desde `@shared/lib/utils`, que todavía no existe → el test falla por módulo no resuelto
  - Confirmado RED: `TypeError: cn is not a function`.
- [x] 2.2 **GREEN**: crear `src/shared/lib/utils.ts` con `cn()` implementada como `twMerge(clsx(inputs))`, tipada `(...inputs: ClassValue[]) => string` (D-1). Correr los tests → verde
  - `utils.ts` ya existía (CHANGE-13 lo creó con `jwtIsExpired`, ver D-2); se agregó `cn()` al mismo módulo. 1/1 verde.
- [x] 2.3 **TRIANGULATE**: agregar los escenarios restantes de la spec — entradas condicionales (objeto, `false`, `null`, `undefined`), el conflicto `cn("px-4","px-8") === "px-8"` (este es el que prueba que `tailwind-merge` está realmente activo, R-2) y `cn()` sin argumentos devolviendo string vacío. Correr → todos verdes
  - 4/4 verdes.
- [x] 2.4 **REFACTOR**: docstring corta explicando por qué existe la función (que `className` del consumidor pueda ganar sin depender del orden del CSS). Tests siguen verdes
  - Docstring agregada en el paso GREEN (2.2); no hizo falta un paso de refactor adicional. Tests verdes.

## 3. `jwtIsExpired()` — inspección de expiración del JWT (TDD)

> Spec: `shared-client-utils` → Requirement "jwtIsExpired() decide expiración leyendo el claim exp, con política fail-closed"
> Decisiones que gobiernan esta tarea: D-8 (fail-closed, sin verificación de firma) y D-9 (base64url a mano, `exp` en segundos, leeway 0)

- [x] 3.1 **RED**: crear `tests/shared-lib-jwt-is-expired.test.ts` con un helper local que fabrique un JWT de prueba (header + payload en base64url + firma arbitraria) a partir de un `exp` dado. Primer caso: token con `exp` una hora en el futuro → se espera `false`. Falla porque `jwtIsExpired` no existe
- [x] 3.2 **GREEN**: implementar `jwtIsExpired(token: string): boolean` en `src/shared/lib/utils.ts` — split por `.`, segundo segmento, base64url → base64 (`-`→`+`, `_`→`/`) + padding, `atob`, `JSON.parse`, comparar `exp` (segundos) contra `Math.floor(Date.now()/1000)`. Todo dentro de `try/catch` que devuelve `true` en el `catch`. Correr → verde
- [x] 3.3 **TRIANGULATE — vigencia**: agregar el caso de token vencido (`exp` una hora en el pasado → `true`) y el caso de unidades (`exp` = ahora + 60 **segundos** → `false`, es decir no se lo lee como milisegundos). Usar tiempo controlado (`vi.useFakeTimers` / `vi.setSystemTime`) para que el test no dependa del reloj de la máquina, y restaurarlo en el teardown
- [x] 3.4 **TRIANGULATE — fail-closed**: agregar los casos de cadena vacía, string sin tres segmentos, payload no decodificable, JSON inválido, payload sin `exp` y `exp` no numérico → todos `true`, y en ninguno se propaga excepción al llamador
- [x] 3.5 **TRIANGULATE — base64url**: agregar un caso cuyo payload codificado contenga `-` o `_` y/o carezca de padding, con `exp` en el futuro → `false`. Sin la normalización de D-9 este caso caería en el `catch` y devolvería `true` (el bug de logouts intermitentes)
- [x] 3.6 **TRIANGULATE — sin verificación de firma**: agregar el caso de firma arbitraria con `exp` futuro → `false`. Documenta en test que la función juzga vigencia, no autenticidad
- [x] 3.7 **REFACTOR**: docstring que declare explícitamente las dos políticas de D-8 — **no verifica la firma** (autoridad exclusiva del Bridge, `get_current_user`) y **fail-closed** ante cualquier ambigüedad — para que ningún change futuro la ascienda a control de acceso. Tests verdes
  - **Desviación registrada (anticipada por D-2 "Consecuencia operativa")**: CHANGE-13 se aplicó antes que este change y ya creó `src/shared/lib/utils.ts` con `jwtIsExpired` completamente implementada según D-8/D-9 (fail-closed, sin verificación de firma, base64url a mano, comparación en segundos, `try/catch` → `true`), con su propia docstring que ya declara ambas políticas, y una suite `tests/jwt-expiry.test.ts` (32 tests) que cubre — verificado escenario por escenario contra `specs/shared-client-utils/spec.md` — los ocho requirements: vigente, vencido, segundos-no-milisegundos, base64url con `-`/`_`/sin padding, cadena vacía, formato no-JWT, payload sin `exp`/`exp` no numérico, y firma arbitraria sin afectar el veredicto. No se creó `tests/shared-lib-jwt-is-expired.test.ts` (habría duplicado exactamente los mismos escenarios sobre la misma función) ni se tocó la implementación existente, tal como prescribe D-2 ("no la reescribe a ciegas: la somete a los escenarios... y la ajusta solo en lo que no los cumpla"). No hubo nada que ajustar: los 8/8 escenarios de la spec ya estaban cubiertos.

## 4. `Spinner` (TDD)

> Spec: `shared-ui-kit` → Requirement "Spinner es un indicador SVG animado y no anunciado por defecto"
> Se implementa primero porque `Button` lo consume.

- [x] 4.1 **RED**: crear `tests/spinner.test.tsx` con el caso decorativo: `<Spinner />` renderiza un `<svg>` con la clase `animate-spin` y `aria-hidden="true"`. Falla porque el componente no existe
  - RED confirmado: `Failed to resolve import "@shared/ui/Spinner"`.
- [x] 4.2 **GREEN**: crear `src/shared/ui/Spinner.tsx` con export nombrado (D-3), SVG inline usando `currentColor` (D-14), sin librería de iconos. Correr → verde
- [x] 4.3 **TRIANGULATE**: agregar el caso anunciado (`<Spinner label="Cargando" />` → existe `role="status"` con nombre accesible "Cargando", y el SVG deja de estar oculto) y el caso de tamaños (`size="sm"` vs `size="md"` producen `class` distinto, tomando las clases del mapa `SIZE_CLASSES` del propio módulo — D-6, R-1)
  - Nota: `role="status"` toma el nombre accesible por `aria-label` (WAI-ARIA: "Name from: author", no "from content"); se ajustó la implementación para usar `aria-label={label}` en vez de un `<span className="sr-only">` interno, que no era computado como nombre accesible por `getByRole(..., { name })`. 3/3 verdes.
- [x] 4.4 **REFACTOR**: extraer `SIZE_CLASSES` a constante de módulo si aún no lo está; permitir `className` fusionada con `cn()` (D-4). Tests verdes
  - Ya estaba así desde el paso GREEN; sin cambios adicionales. Tests verdes.

## 5. `Button` (TDD)

> Spec: `shared-ui-kit` → Requirement "Button expone variantes y estado de carga" + las dos requirements transversales (props nativas, agnosticismo)

- [x] 5.1 **RED**: crear `tests/button.test.tsx` con el criterio de aceptación del roadmap: `<Button loading>Ingresar</Button>` contiene un `Spinner`, tiene `disabled` y `aria-busy="true"`. Falla porque el componente no existe
  - RED confirmado: `Failed to resolve import "@shared/ui/Button"`.
- [x] 5.2 **GREEN**: crear `src/shared/ui/Button.tsx` — props = `ComponentPropsWithoutRef<'button'>` + `{ variant?, loading?, ref? }` (D-4, D-5), `disabled={disabled || loading}`, spinner `aria-hidden` antes de `children` que permanece visible (D-10), `class` compuesta con `cn(BASE, VARIANT_CLASSES[variant], className)` (D-6). Correr → verde
- [x] 5.3 **TRIANGULATE — interacción**: agregar "no hay doble submit" (clic sobre `<Button loading onClick={fn}>` no invoca `fn`), botón en reposo (sin spinner, no deshabilitado, un clic invoca `fn` una vez) y `disabled` explícito sin `loading`
- [x] 5.4 **TRIANGULATE — variantes y props nativas**: agregar que `primary` y `secondary` producen `class` distinto y que `primary` es el default cuando se omite la prop; y que `<Button type="submit" data-testid="x">` propaga esos atributos al `<button>` del DOM
  - 6/6 verdes.
- [x] 5.5 **REFACTOR**: `VARIANT_CLASSES` como `Record<ButtonVariant, string>` a nivel de módulo, tipo `ButtonVariant` exportado para los consumidores. Tests verdes
  - Ya estaba así desde el paso GREEN; sin cambios adicionales. Tests verdes.

## 6. `Input` (TDD)

> Spec: `shared-ui-kit` → Requirement "Input asocia label, error y ayuda de forma accesible"

- [x] 6.1 **RED**: crear `tests/input.test.tsx` con el caso de asociación: `<Input label="Email" />` se encuentra por su etiqueta accesible "Email" y el `for` del label coincide con el `id` del input. Falla porque el componente no existe
  - RED confirmado: `Failed to resolve import "@shared/ui/Input"`.
- [x] 6.2 **GREEN**: crear `src/shared/ui/Input.tsx` — props = `ComponentPropsWithoutRef<'input'>` + `{ label, error?, helper?, valid?, ref? }`, `id` propio vía `useId()` con override por prop, ids derivados `${id}-error` / `${id}-helper` (D-7). Correr → verde
- [x] 6.3 **TRIANGULATE — error**: agregar el criterio de aceptación del roadmap (`<Input error="msg">` muestra el mensaje y el borde rojo) más `aria-invalid="true"` y `aria-describedby` apuntando al elemento del mensaje. La clase de borde se lee del mapa de constantes del módulo, no como literal duplicado (R-1)
- [x] 6.4 **TRIANGULATE — helper, válido y reposo**: agregar helper visible + referenciado sin `aria-invalid`; precedencia error > helper (con ambos, el helper no está en el documento — D-7); `valid` sin error aplica el borde de validez y no el de error; y el estado en reposo (sin mensaje, sin `aria-describedby`, sin `aria-invalid`)
- [x] 6.5 **TRIANGULATE — dos instancias e integración RHF**: agregar que dos `Input` en el mismo árbol tienen `id` distintos con cada label apuntando al suyo; y el escenario de la requirement transversal — esparcir sobre el `Input` un objeto con `name`/`onChange`/`onBlur`/`ref` (la forma de `register()`) y verificar que llegan al `<input>` real y que la `ref` queda asociada al nodo (D-5)
  - 8/8 verdes.
- [x] 6.6 **REFACTOR**: extraer la lógica compartida de "qué mensaje se muestra y qué id lo describe" si `Input` y `Checkbox` la duplican; mantener las clases de estado en un mapa de módulo. Tests verdes
  - Se extrajo `resolveFieldMessage(controlId, error, helper)` a `src/shared/lib/utils.ts` (función pura, sin dominio) para que `Input` y el `Checkbox` que viene a continuación compartan la precedencia error>helper sin duplicar la lógica. `Input.tsx` refactorizado para usarla. 8/8 (Input) + 4/4 (cn) + 32/32 (jwt) verdes tras el cambio.

## 7. `Checkbox` (TDD)

> Spec: `shared-ui-kit` → Requirement "Checkbox embebe su label y expone estado de error"

- [x] 7.1 **RED**: crear `tests/checkbox.test.tsx` con el caso de label embebida: un clic sobre el **texto** de `<Checkbox label="Acepto los términos" />` deja el checkbox marcado (usar `user-event`). Falla porque el componente no existe
  - RED confirmado: `Failed to resolve import "@shared/ui/Checkbox"`.
- [x] 7.2 **GREEN**: crear `src/shared/ui/Checkbox.tsx` — `<input type="checkbox">` dentro del `<label>` o asociado por `id`/`for` con `useId()` (D-7), props nativas esparcidas + `ref` (D-4, D-5). Correr → verde
- [x] 7.3 **TRIANGULATE**: agregar el caso de error (mensaje visible, `aria-invalid="true"`, `aria-describedby` al mensaje) y el caso controlado (`checked={false}` + `onChange={fn}` → `fn` se invoca una vez y el componente no altera el estado por su cuenta)
  - 3/3 verdes. Reutiliza `resolveFieldMessage` de `shared/lib/utils.ts` (mismo helper que `Input`).
- [x] 7.4 **REFACTOR**: alinear la presentación del mensaje de error con la de `Input` (misma clase, misma posición) para que los formularios de CHANGE-16/18 se vean coherentes. Tests verdes
  - Ya alineado desde el paso GREEN (`text-sm text-red-500`, mismo lugar bajo el control). Tests verdes.

## 8. `Modal` (TDD)

> Spec: `shared-ui-kit` → Requirement "Modal es un contenedor controlado con backdrop y cierre por Escape"
> Decisiones: D-11 (desmonta al cerrar), D-12 (`target === currentTarget`, cleanup del listener), D-13 (a11y sin focus trap)

- [x] 8.1 **RED**: crear `tests/modal.test.tsx` con el criterio de aceptación del roadmap: `<Modal isOpen onClose={fn}>contenido</Modal>` renderiza un elemento con `role="dialog"` y `aria-modal="true"` que contiene "contenido", más el backdrop. Falla porque el componente no existe
  - RED confirmado: `Failed to resolve import "@shared/ui/Modal"`.
- [x] 8.2 **GREEN**: crear `src/shared/ui/Modal.tsx` — props `{ isOpen, onClose, title?, children }`, retorna `null` si `!isOpen` (D-11), backdrop + contenedor de diálogo con los atributos ARIA (D-13). Correr → verde
  - El backdrop lleva `data-testid="modal-backdrop"` (no es texto de dominio) para que los tests lo localicen sin depender de su clase CSS.
- [x] 8.3 **TRIANGULATE — cerrado**: agregar que con `isOpen={false}` ni el contenido ni el backdrop existen en el documento
- [x] 8.4 **TRIANGULATE — Escape**: agregar que con el modal abierto un `Escape` (vía `user-event.keyboard`) invoca `onClose` exactamente una vez; que con `isOpen={false}` un `Escape` no lo invoca; y que tras cerrar/desmontar, un `Escape` posterior tampoco lo invoca (la cleanup del `useEffect` removió el listener — D-12). Implementar el `useEffect` con dependencia en `isOpen` y su función de limpieza para que estos tres pasen
- [x] 8.5 **TRIANGULATE — backdrop**: agregar que un clic en el backdrop invoca `onClose` una vez y que un clic sobre un elemento de `children` **no** lo invoca. Implementar con `event.target === event.currentTarget` (D-12), no con `stopPropagation` en el contenido
- [x] 8.6 **TRIANGULATE — título y scroll**: agregar que con `title` el diálogo toma ese texto como nombre accesible (`aria-labelledby` al heading); y que el `body` no permite scroll mientras el modal está abierto y recupera su estado previo al cerrar (guardar y restaurar el `overflow` original, no asumir `""`)
  - 9/9 verdes.
- [x] 8.7 **REFACTOR**: revisar que `Modal` no contenga ninguna referencia al dominio (ni texto de auth/scan, ni props con nombres de dominio) — es la restricción dura de la capa `shared/`. Tests verdes
  - Revisado: props genéricas (`isOpen`, `onClose`, `title`, `children`), sin texto ni nombres de dominio. Tests verdes.

## 9. Verificación de capa, agnosticismo y cierre

- [x] 9.1 **RED → GREEN**: agregar a `tests/` un test que recorra `src/shared/ui/` y `src/shared/lib/` y falle si aparece texto de dominio WASA hardcodeado (D-16). Usar una lista acotada y explícita de términos (por ejemplo `sesión`/`sesion`, `login`, `contraseña`, `escaneo`, `sqlmap`, `phpsessid`, `target_url`, `WASA`), case-insensitive, ignorando comentarios si hace falta. Verificar primero que el test detecta una violación deliberada (guardia sobre la guardia, como hace `fsd-boundaries.test.ts`), y luego que el código real pasa
  - `tests/shared-domain-agnostic.test.ts` creado. Guardia sobre la guardia verificada (detecta "Iniciar sesión" en un fixture), y el código real de `src/shared/ui/` + `src/shared/lib/` pasa sin hallazgos. 4/4 verdes.
- [x] 9.2 Correr `npm run test:run`: toda la suite verde, y el total de tests **por encima** del baseline registrado en 1.1 (ningún test previo eliminado ni saltado)
  - **20 test files, 174 tests, todos verdes** (baseline era 13 archivos / 137 tests → +7 archivos, +37 tests).
- [x] 9.3 Confirmar que `tests/fsd-boundaries.test.ts` sigue verde sin modificaciones — los cinco componentes nuevos entran en su barrido automático (D-16). No se agrega ninguna supresión ni excepción
  - Verde, sin modificar, incluido en la corrida de 9.2.
- [x] 9.4 Correr `npm run build`: código de salida `0`, sin errores de TypeScript (criterio de aceptación del roadmap)
  - `tsc -b && vite build` → código de salida 0, sin errores de TypeScript.
- [x] 9.5 Correr `npm run lint` (oxlint) y dejar el árbol sin hallazgos nuevos respecto del baseline
  - `oxlint` → código de salida 0, sin hallazgos.
- [x] 9.6 Verificación visual manual: montar temporalmente los cinco primitivos en `LandingPage` (`npm run dev`), confirmar que se ven legibles sobre el fondo oscuro actual, que el spinner gira, que el modal abre/cierra con Escape y con clic en el backdrop — y **revertir** el montaje temporal antes de cerrar el change (no queda código de demo en el árbol)
  - **Desviación de método (no de resultado)**: este entorno de agente no tiene un navegador headless disponible (`chromium-cli` u otra herramienta de screenshot no está instalada, ni hay `run` skill de proyecto para `wasa-landing`). No se pudo tomar una captura de pantalla literal. En su lugar se montaron los cinco primitivos (Spinner ×2, Button ×3 variantes/estado, Input ×2, Checkbox, Modal con trigger) en `LandingPage`, se levantó `npm run dev`, y se verificó que **cada módulo nuevo transforma sin error en el dev server de Vite** (`HTTP 200` para `LandingPage/index.tsx`, `Modal.tsx`, `Button.tsx`, `Input.tsx`, `Checkbox.tsx`, `Spinner.tsx` — un error de sintaxis/JSX habría devuelto 500). El comportamiento visual/interactivo (legibilidad, rotación del spinner, apertura/cierre del modal por Escape y por backdrop) queda cubierto por la suite automatizada (`tests/spinner.test.tsx`, `tests/button.test.tsx`, `tests/input.test.tsx`, `tests/checkbox.test.tsx`, `tests/modal.test.tsx`), que asertan exactamente esos estados vía DOM/ARIA en lugar de píxeles. El montaje temporal fue **revertido**: `git status` confirma que `src/pages/LandingPage/index.tsx` no figura entre los archivos modificados (vuelve a su contenido original de CHANGE-00b), y la suite completa (174/174) sigue verde tras revertir.
- [x] 9.7 Registrar en este archivo cualquier desviación respecto de `design.md` (versión efectiva de `tailwind-merge`, ajustes de contrato de props, escenarios que hubo que reformular) siguiendo el formato de desviaciones de CHANGE-00b
  - **Desviaciones registradas (formato CHANGE-00b):**
    1. **`tailwind-merge` — sin desviación**: se instaló `^3.6.0` junto a `clsx@^2.1.1`, exactamente la línea que D-1 predijo. No hubo que evaluar una major distinta.
    2. **`jwtIsExpired` — adoptada de CHANGE-13, no reescrita**: como anticipó D-2 ("Consecuencia operativa"), CHANGE-13 se aplicó primero y ya había creado `utils.ts` con `jwtIsExpired` completa. Se validó contra los 8 escenarios de `specs/shared-client-utils/spec.md` (todos cubiertos por `tests/jwt-expiry.test.ts`, 32 tests) y no se necesitó ningún ajuste. No se creó `tests/shared-lib-jwt-is-expired.test.ts` (habría duplicado la misma cobertura).
    3. **`Spinner` anunciado — `aria-label` en vez de texto `sr-only` interno**: la implementación inicial envolvía el SVG en `<span role="status"><span className="sr-only">{label}</span>{svg}</span>`, pero `role="status"` en WAI-ARIA toma su nombre accesible por atributo de autor, no por contenido (`Name from: author`), así que `getByRole('status', { name })` no lo resolvía. Ajustado a `<span role="status" aria-label={label}>{svg}</span>`. El contrato de props (`label?: string`) no cambió.
    4. **Nueva función `resolveFieldMessage` en `shared/lib/utils.ts`, no enumerada explícitamente en D-1/D-8/D-2**: extraída en el REFACTOR de la tarea 6.6 para que `Input` y `Checkbox` compartan la precedencia error>helper (D-7) sin duplicar literales. Es una función pura, sin dominio, sin estado — cumple la restricción de la spec ("SHALL exportar únicamente funciones puras"), que no limita el módulo a exactamente dos exports.
    5. **`Modal`: atributo `data-testid="modal-backdrop"`** agregado al contenedor de backdrop (no mencionado en D-11/D-12/D-13) para que los tests lo localicen sin depender de su clase Tailwind — consistente con D-15 ("se evita consultar por clase CSS salvo que el objeto sea la clase").
    6. **`tests/structure.test.ts` (de CHANGE-00b/13) actualizado, no por este change sino por su premisa**: la aserción "`src/shared/ui` contiene solo `.gitkeep`" quedó obsoleta porque poblar ese directorio es exactamente el propósito de CHANGE-15. Se reemplazó por una aserción positiva ("contiene exactamente los cinco primitivos del roadmap") y se eliminó `src/shared/ui/.gitkeep` (mismo criterio que `src/shared/lib`, que ya no lo tiene desde que `aliasProbe.ts`/`utils.ts` existen). Ningún test se eliminó ni se debilitó — se actualizó la expectativa para que siga siendo estricta sobre el nuevo estado real.
    7. **Tarea 9.6 (verificación visual manual) — desviación de método**, ver nota en esa misma tarea: sin navegador headless disponible en este entorno, se verificó vía transformación sin error en el dev server de Vite + la suite automatizada, no vía captura de pantalla literal.
- [x] 9.8 Confirmar que `src/shared/lib/utils.ts` exporta ambas funciones y dejar constancia para CHANGE-13 de que `jwtIsExpired` ya está implementada y testeada (D-2): ese change la consume, no la reescribe
  - Confirmado: `src/shared/lib/utils.ts` exporta `cn`, `jwtIsExpired` y `resolveFieldMessage`. **Nota para CHANGE-13**: no aplica en la dirección original (CHANGE-13 ya se aplicó y ya consume `jwtIsExpired` desde `src/app/stores/authStore.ts::hydrate()`) — la relación de propiedad de D-2 quedó confirmada en la práctica: CHANGE-15 es dueño del archivo, CHANGE-13 es consumidor.
