## Context

Ver `proposal.md` §Why para la motivación y `specs/` para el contrato. Acá sólo el estado del árbol que condiciona el enfoque, verificado leyendo los archivos (no supuesto):

| Pieza | Estado real en `lauti/c-13-zustand-auth-store` | Consecuencia para este change |
|---|---|---|
| `src/app/stores/` | sólo `.gitkeep` con el texto `# CHANGE-13 — authStore.ts` | se crea `authStore.ts` y se retira el `.gitkeep` |
| `src/shared/lib/` | `aliasProbe.ts` (fixture de alias, D-9 de CHANGE-00b) + `.gitkeep` `# CHANGE-13/15 — utils.ts` | se crea `utils.ts`; `aliasProbe.ts` no se toca |
| `src/app/App.tsx` | `function App() { return <LandingPage /> }`, sin hooks ni imports de estado | se le agrega un `useEffect`; el árbol renderizado no cambia |
| `src/app/main.tsx` | monta `<App />` dentro de `<StrictMode>` | **los efectos corren dos veces en desarrollo** → la hidratación debe ser idempotente (D-6) |
| `package.json` | `zustand@^5.0.15` en `dependencies`; sin `jwt-decode` ni equivalente | se usa Zustand 5; el JWT se parsea con APIs del navegador (D-10) |
| `vite.config.ts` | `test.environment: 'jsdom'`, `globals: true`, `test.include: ['tests/**/*.test.{ts,tsx}']`, `setupFiles: ['./tests/setup.ts']` | los tests van en `wasa-landing/tests/`, **no** colocados junto al código; jsdom provee `localStorage` real, con estado que persiste entre tests del mismo archivo (D-13) |
| `tests/setup.ts` | sólo `import '@testing-library/jest-dom/vitest'` | no hay limpieza global de `localStorage`: cada archivo de test debe hacerla (D-13) |
| `tests/structure.test.ts` | contiene `it('src/app/stores/authStore.ts does not exist')` | test archivado que este change **contradice**; se invierte (D-14) |
| `tests/fsd-boundaries.test.ts` | recorre todo `src/` por AST y falla si una capa importa de una superior | `shared/lib/utils.ts` no puede importar nada de `app/` — condiciona D-12 |
| `tsconfig.app.json` | `strict` heredado, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax` | los tipos de los `catch` son `unknown`; los imports de sólo-tipo necesitan `import type` |
| `shared/config/env.ts` | única puerta a `import.meta.env`, falla ruidosamente al cargar | **precedente contrario** al que se adopta acá para el almacenamiento (ver D-4) |

Restricciones vigentes que este change debe respetar: la dirección de capas FSD `app → pages → widgets → features → entities → shared` (verificada por test); `shared/` no conoce el dominio WASA; nombres `camelCase.ts` para módulos de funciones utilitarias y `PascalCase.tsx` para componentes.

## Goals / Non-Goals

**Goals:**
- Que "estar autenticado" sea **un solo predicado, en un solo lugar**, y que su invariante (`isAuthenticated === (token !== null)`) sea imposible de romper desde afuera.
- Que la persistencia sea **explícita y auditable**: un único módulo lee y escribe el almacenamiento, con tres operaciones nombradas y ningún camino implícito de rehidratación.
- Que la validación de vencimiento sea una **función pura y testeable con el reloj congelado**, separada del estado y sin conocimiento del dominio.
- Que ningún fallo del almacenamiento —vencido, corrupto, indisponible, que lanza— pueda dejar la aplicación en pantalla en blanco ni con una sesión falsamente autenticada.

**Non-Goals:**
- Verificar criptográficamente el JWT en el cliente. La autoridad sobre la validez sigue siendo el Bridge; acá sólo se decide vigencia temporal.
- Reaccionar a la expiración **durante** una sesión abierta (temporizador, o al `401` en vuelo). Es CHANGE-16.
- Sincronizar la sesión entre pestañas (evento `storage`). Nadie lo pidió y agrega una superficie de comportamiento que ningún criterio de aceptación cubre.
- Refresh tokens, recuperación de contraseña, "recordarme" opcional (SU-03).
- Cualquier UI: muro de auth, botón de cierre de sesión, modales. Acá va el estado que esa UI consumirá.

## Decisions

> **Governance ALTO.** Este change escribe credenciales en el navegador del usuario y define el predicado que abre el formulario de escaneo. No está cubierto por la excepción MEDIUM que el `CLAUDE.md` del proyecto concede a CHANGE-01..07. **D-1 a D-6 requieren confirmación explícita del usuario antes de correr `/opsx:apply`.** D-7 a D-14 son decisiones técnicas cerradas, listadas para revisión pero no bloqueantes.

### D-1 — `jwtIsExpired` falla cerrada: ante la duda, vencido — incluido el token sin claim `exp` ⚠️ requiere firma

**Decisión.** Toda entrada de la que no se pueda extraer un instante de expiración inequívoco devuelve `true` ("vencido"): cadena vacía, cadena sin tres segmentos, payload no decodificable, payload que no es JSON, JSON sin `exp`, y `exp` no numérico (cadena, `null`, objeto, `NaN`, `Infinity`). La función **nunca lanza**: cada uno de esos caminos es un `return true`, no una excepción propagada.

**Por qué.** El único consumidor es la restauración de sesión, y las dos formas de equivocarse no son simétricas: fallar abierta significa mostrarle el formulario de escaneo a alguien cuyo token el Bridge va a rechazar (y desplazar el error del `401` a un punto lejano y confuso); fallar cerrada significa, en el peor caso, pedirle un login de más a alguien que tenía una sesión válida. En un cambio de dominio auth, el costo asimétrico manda.

**El punto que necesita firma.** El caso `exp` **ausente** es el discutible. Un JWT sin `exp` es, formalmente, un token sin vencimiento: interpretarlo como "vencido" es una elección de política, no una lectura del estándar. Se elige "vencido" porque **RN-WS-14 garantiza que el Bridge siempre emite `exp`** (expiración configurable, default 24h), de modo que un token sin `exp` en `localStorage` no proviene de nuestro emisor y no hay razón para confiarle una sesión. Si el usuario prefiere la interpretación literal del estándar (sin `exp` ⇒ no vence), cambia un escenario del spec de `jwt-expiry-inspection` y una rama de la implementación.

**Alternativas descartadas.** (a) Lanzar una excepción tipada y que el store decida: mueve la política a dos lugares y obliga a un `try/catch` en cada llamador — la primera vez que alguien olvide envolverla, un token basura tumba el arranque de la aplicación. (b) Devolver un tri-estado `'valid' | 'expired' | 'unreadable'`: más expresivo, pero el scope fija la firma `jwtIsExpired(token: string): boolean` y ningún consumidor actual distinguiría los dos últimos casos.

### D-2 — La restauración purga el almacenamiento inválido ⚠️ requiere firma

**Decisión.** Cuando la restauración encuentra una sesión vencida, corrupta o incompleta, además de dejar la aplicación no autenticada **borra** lo que encontró.

**Por qué.** Un token vencido que sobrevive en `localStorage` es basura con costo: se reevalúa en cada arranque, sigue siendo legible por cualquier script del origen (y por quien mire el DevTools del equipo), y produce un estado ambiguo —"hay algo guardado pero no estamos autenticados"— que el próximo change tendría que volver a interpretar. La restauración es el único punto donde se descubre la invalidez; es también el único punto natural donde repararla, y deja un invariante fuerte: **si hay algo en el almacenamiento, es una sesión que estaba vigente la última vez que se miró.**

**El punto que necesita firma.** La purga es una escritura destructiva sobre datos del usuario disparada por una heurística de lectura. Si D-1 se equivoca (por ejemplo, un token legítimo se juzga ilegible), la purga convierte un falso positivo recuperable en un borrado. El riesgo real es acotado —lo que se borra es un token que el Bridge iba a rechazar igual, y el remedio es volver a loguearse— pero es una decisión de nivel ALTO por la naturaleza de la operación.

**Alternativa descartada.** No purgar y limitarse a no autenticar: menos código, pero deja el token vencido en el navegador indefinidamente y contradice la lectura natural de RN-WS-14 ("al expirar, el frontend limpia el authStore").

### D-3 — Una sola clave de almacenamiento con la sesión completa en JSON ⚠️ requiere firma

**Decisión.** La sesión se persiste bajo **una única clave**, `wasa.auth`, con el valor `{"token": "...", "email": "..."}` serializado en JSON. No dos claves separadas.

**Por qué.** Una clave es una escritura, una lectura y un borrado: la sesión no puede quedar a medias porque la segunda de dos operaciones falló, y "purgar" (D-2) es un solo `removeItem` que no puede dejar restos. Con dos claves aparece un estado intermedio real —token sin email— que habría que detectar y limpiar en cada arranque. El prefijo `wasa.` acota el espacio de nombres frente al resto del origen.

**El punto que necesita firma.** El nombre y la forma son **contrato de facto** con lo que venga después: si en algún momento otra pieza (el Dashboard existente en el mismo origen, un script de diagnóstico, o un desarrollador buscando el token a mano) espera encontrar una clave `token` con el JWT en crudo, esta decisión la rompe. Vale confirmar que nadie fuera de `wasa-landing/` lee ese almacenamiento hoy.

**Alternativa descartada.** Dos claves (`wasa.auth.token`, `wasa.auth.email`): más legible en el DevTools, a cambio de estados parciales posibles y tres operaciones donde alcanza una.

### D-4 — Un almacenamiento que lanza degrada la persistencia, no la aplicación ⚠️ requiere firma

**Decisión.** Todo acceso a `localStorage` va envuelto en `try/catch`. Si falla la escritura, la sesión igual queda establecida **en memoria** y vale para la pestaña actual; si falla la lectura, la aplicación arranca no autenticada; si falla el borrado, el estado en memoria se limpia igual. Ningún fallo de almacenamiento se propaga a la interfaz.

**Por qué.** `localStorage` puede lanzar de verdad, no en teoría: modo privado de Safari histórico, navegadores con almacenamiento de sitio bloqueado, cuota agotada. Un `SecurityError` sin capturar durante el `useEffect` de montaje tumba el árbol de React y deja la Landing en blanco — el peor resultado posible para una página cuyo objetivo es que un visitante anónimo lance un escaneo. Perder la persistencia sólo cuesta un login extra en la próxima recarga.

**El punto que necesita firma, y una inconsistencia declarada.** Esto contradice el criterio que el proyecto adoptó en `shared/config/env.ts`, donde la ausencia de configuración **falla ruidosamente al cargar el módulo** (D-5/D-7 de CHANGE-00b). La diferencia que justifica el trato distinto: una variable de entorno faltante es un error del desarrollador, detectable en el primer arranque y siempre reproducible; un `localStorage` bloqueado es una condición del navegador del visitante, que el desarrollador no puede arreglar y que no debería costarle la página a quien la visita. Aun así, es una inconsistencia de criterio dentro del mismo frontend y merece una decisión consciente en vez de quedar sepultada en un `catch`.

**Alternativa descartada.** Detectar la disponibilidad una vez al cargar el módulo y cachear el resultado: una prueba de escritura al importar tiene su propio efecto secundario, y no cubre el caso de la cuota que se agota más tarde.

### D-5 — Sin tolerancia de reloj: el límite es cerrado en `now >= exp` ⚠️ requiere firma

**Decisión.** Se compara `Math.floor(Date.now() / 1000) >= exp`. Cero segundos de margen, y el instante exacto de expiración ya cuenta como vencido.

**Por qué.** El margen (*leeway*) tiene sentido cuando dos relojes deben coincidir en un veredicto **de seguridad**; acá el veredicto del cliente no autoriza nada: la autorización real la hace el Bridge al validar la firma y el `exp` con su propio reloj. Un margen positivo (aceptar tokens vencidos hace 30 s) sólo agrega la ventana en la que el frontend se cree autenticado y el Bridge responde `401`. Un margen negativo (descartar 30 s antes) desloguea a alguien que todavía podía operar. Con `exp` a 24 h, ninguna de las dos ventanas compra nada.

**El punto que necesita firma.** El reloj del visitante puede estar arbitrariamente mal, y no hay defensa contra eso en el cliente: un reloj atrasado un día hace que la aplicación considere vigente un token que el Bridge ya rechaza (el usuario ve el formulario y recibe un `401` al enviar), y uno adelantado provoca un logout prematuro. Se acepta explícitamente: es intrínseco a validar expiración del lado del cliente, y el `401` del Bridge es la red de contención (CHANGE-16).

### D-6 — La hidratación corre en `useEffect` y se acepta un primer frame no autenticado ⚠️ requiere firma

**Decisión.** `App.tsx` invoca la restauración desde un `useEffect(() => { hydrate() }, [])`, tal como fija el scope. El estado del store **no** incorpora un indicador `isHydrated`.

**Consecuencia, que es lo que necesita firma.** `useEffect` corre **después** del primer render. Un usuario con sesión válida verá, durante un frame, el estado no autenticado: cuando CHANGE-19/20 construyan el muro de autenticación sobre `isAuthenticated`, eso se manifiesta como un **destello del muro antes de que aparezca el formulario**. Y hay una ambigüedad de fondo que este change deja sin resolver: `isAuthenticated === false` significa a la vez "no hay sesión" y "todavía no se miró si la hay", y ningún consumidor puede distinguirlas.

Las tres salidas posibles, para decidir ahora y no en CHANGE-19:
- **(a) Aceptar el destello** — lo que fija el scope. Cero estado extra; el costo aparece recién cuando exista UI.
- **(b) Agregar `isHydrated: boolean` al estado** y que la UI no renderice la rama de auth hasta que sea verdadero. Es la solución estándar y barata, pero **extiende la forma del estado más allá del scope de CHANGE-13** y cambia dos escenarios del spec.
- **(c) Hidratar de forma síncrona al inicializar el store** (leer el almacenamiento al crear el store, antes del primer render) y dejar el `useEffect` como no-op. Elimina el destello de raíz, pero mueve un efecto de I/O al import del módulo, contradice el scope explícito ("`App.tsx` llama `hydrate()` en un `useEffect` al montar") y hace el estado inicial no determinístico en los tests.

**Recomendación: (a) ahora, con (b) declarada como el cambio previsible de CHANGE-19** si el destello resulta visible en la práctica. Se documenta acá para que aparezca como decisión y no como bug.

**Corolario obligatorio, no opcional:** `main.tsx` monta bajo `<StrictMode>`, que ejecuta los efectos **dos veces** en desarrollo. La restauración debe ser idempotente: leer, decidir y escribir el estado, sin acumular nada. Con la purga de D-2 esto se cumple naturalmente (la segunda pasada encuentra el almacenamiento ya limpio y llega al mismo estado), pero es una propiedad que hay que testear, no suponer.

### D-7 — No se usa el middleware `persist` de Zustand

`knowledge-base/08_arquitectura_propuesta.md` rotula el patrón como *"Zustand + persist"*. Se implementa la **propiedad** que ese rótulo describe (la sesión persiste en `localStorage`) **sin el middleware homónimo**, por tres razones concretas: (1) `persist` rehidrata **sin validar**, así que habría que interceptar `onRehydrateStorage` para aplicar `jwtIsExpired` y limpiar — más maquinaria que el `hydrate()` explícito, para el mismo resultado; (2) el scope fija tres acciones nombradas (`login`/`logout`/`hydrate`) que son el contrato con CHANGE-16/19/20, y `persist` las volvería parcialmente redundantes; (3) `persist` guarda la porción de estado que se le indique con su propio envoltorio versionado (`{state, version}`), lo que hace de la forma del almacenamiento un detalle de la librería en vez de una decisión nuestra (D-3), justo en el dato más sensible de la aplicación. Se deja constancia de la divergencia con la tabla del KB porque es deliberada: es una diferencia de *cómo*, no de *qué*.

### D-8 — `isAuthenticated` vive en el estado, pese a ser derivable

La convención de Zustand del proyecto dice no guardar valores derivados (derivarlos en selectores), y `isAuthenticated` es exactamente `token !== null`. Se guarda igual, porque el scope y los criterios de aceptación de CHANGE-13 lo fijan como parte de la forma del estado y CHANGE-19/20 ramifican sobre él. La convención se honra por otra vía: `isAuthenticated` **no es fijable de manera independiente** —no hay setter que lo toque solo— y las tres acciones lo escriben en el **mismo `set()`** que al token y al email, de modo que jamás existe un render con el invariante roto. El invariante se verifica por test tras cada transición.

### D-9 — El store se expone como hook con selectores; nadie se suscribe al store entero

Se exporta `useAuthStore` creado con `create<AuthState>()(...)` y los consumidores se suscriben con selector (`useAuthStore((s) => s.isAuthenticated)`), nunca desestructurando el store completo — suscribirse a todo hace que un cambio de `email` re-renderice a quien sólo mira `isAuthenticated`. Las acciones se definen **una sola vez** en la creación del store, por lo que sus referencias son estables y pueden usarse como dependencias de efectos sin provocar reejecuciones. Fuera de React (tests, y eventualmente el interceptor de CHANGE-16) se accede con `useAuthStore.getState()`.

### D-10 — Decodificación base64url a mano, sin librería, y por qué `atob` alcanza

El segmento de payload de un JWT viene en **base64url**: alfabeto con `-` y `_` donde base64 usa `+` y `/`, y sin relleno final. `atob` espera base64 estándar, así que hay que traducir (`-`→`+`, `_`→`/`) y reponer el relleno hasta el múltiplo de cuatro **antes** de decodificar. Omitir esa traducción es el error clásico: produce un fallo de decodificación sobre un token perfectamente legítimo que, combinado con la falla cerrada de D-1, se manifiesta como "el usuario se desloguea solo en cada recarga" — un bug con causa lejana a su síntoma. Por eso el spec lo fija como escenario propio.

`atob` devuelve una cadena de bytes (latin1), no texto UTF-8 decodificado. **No hace falta corregirlo** en este change: el único claim que se lee es `exp`, que es numérico y ASCII, y una secuencia UTF-8 multibyte en otro claim (por ejemplo un `sub` con acento) sobrevive como caracteres mal interpretados **dentro de una cadena JSON válida**, sin romper el `JSON.parse` ni tocar `exp`. Si un change futuro necesitara leer un claim de texto de forma fiel, ahí sí haría falta pasar por `TextDecoder`. Se deja anotado en el código.

### D-11 — Sin guarda de SSR, con justificación explícita

La convención de Zustand advierte sobre el acceso a `window`/`localStorage` en entornos sin DOM. Acá **no se agrega ninguna guarda `typeof window === 'undefined'`**: `wasa-landing` es una SPA de Vite servida como estático, sin ningún renderizado en servidor, y el acceso al almacenamiento ocurre sólo dentro de acciones invocadas desde el navegador (nunca en el cuerpo del módulo, que sí correría al importar). Una guarda sería código muerto e intesteable, y el `try/catch` de D-4 ya cubre el caso real de `localStorage` inaccesible. Se documenta la decisión en vez de omitirla en silencio, porque en un proyecto que adopte SSR más adelante habría que revisitarla.

### D-12 — El almacenamiento se toca **sólo** dentro de `authStore.ts`

`utils.ts` (capa `shared/`) contiene únicamente `jwtIsExpired`: una función pura sobre una cadena, sin conocimiento de que existe algo llamado "sesión de WASA". Toda lectura, escritura y borrado del almacenamiento vive en `authStore.ts` (capa `app/`), que sí es dominio. Esto respeta la regla dura de FSD (`shared/` no conoce el dominio; el test de fronteras lo verifica por AST) y deja un único punto donde auditar qué se guarda del usuario — que es exactamente lo que un change de governance ALTO necesita poder afirmar. Los helpers de serialización/purga son privados del módulo del store, no exportados.

### D-13 — Cómo se testea sin flakiness: reloj congelado, almacenamiento limpio y store reseteado

Tres fuentes de estado compartido pueden contaminar esta suite, y las tres se neutralizan en `beforeEach`:
- **El reloj.** Los tests de vigencia usan `vi.useFakeTimers()` + `vi.setSystemTime(...)` y construyen los tokens **relativos a ese instante fijo**, en vez de a `Date.now()` real. Un test que arme un token "que vence en 1 segundo" contra el reloj real es una bomba de tiempo en CI.
- **`localStorage`.** jsdom lo provee de verdad y su contenido persiste entre tests del mismo archivo; `tests/setup.ts` no lo limpia. Cada archivo hace su propio `localStorage.clear()`.
- **El store.** El módulo del store es un singleton: el estado de un test se filtra al siguiente. Se captura el estado inicial al importar y se restaura con `useAuthStore.setState(initialState, true)` (el `true` reemplaza en vez de mezclar).

Para simular un almacenamiento que lanza (D-4) se usa `vi.spyOn(Storage.prototype, 'setItem' | 'getItem' | 'removeItem').mockImplementation(() => { throw ... })`, restaurado al terminar. Los JWT de prueba se arman con un helper local que codifica en base64url un payload arbitrario y una firma de relleno — **sin librería y sin ningún token real**: no debe aparecer en el repositorio un JWT emitido por un Bridge real, ni siquiera vencido.

### D-14 — Actualizaciones declaradas por adelantado sobre archivos ya archivados

Dos cambios sobre trabajo previo, declarados acá para que el apply no los descubra como sorpresa:
1. **`tests/structure.test.ts`** — el caso `'src/app/stores/authStore.ts does not exist'` se invierte a "existe", y se agrega que el directorio no contiene ningún otro store. Es la contracara del delta de `landing-bootstrap`.
2. **Los dos `.gitkeep`** (`app/stores/`, `shared/lib/`) se eliminan: ambos existen para sostener un directorio vacío hasta el change que lo pueble, y ambos directorios quedan poblados. El caso "todo `.gitkeep` bajo `src/` está anotado" sigue pasando con los que quedan (`providers/`, `entities/`, `features/`, `widgets/`, `shared/ui/`, `shared/api/`).

Nota de coordinación: CHANGE-15 corre en el mismo gate y también sumará casos a `tests/`; su `.gitkeep` de `shared/ui/` no se toca acá. El `.gitkeep` de `shared/lib/` nombra "CHANGE-13/15" pero su función (sostener el directorio) ya está cumplida — si CHANGE-15 agrega más funciones a `utils.ts`, no lo necesita.

## Risks / Trade-offs

- **El token en `localStorage` es legible por cualquier script del origen: un XSS es robo de sesión, sin revocación posible del lado del servidor (JWT stateless, sin refresh — DD-01/SU-03).** → No mitigable dentro de este change: la decisión es previa (KB, HU-06-04) y acá se implementa, no se revisa. Se acota lo que sí depende de este change: se guarda el mínimo (token + email) y nada más, nunca la contraseña; el almacenamiento se toca desde un único módulo auditable (D-12); y la sesión inválida se purga en vez de quedar residente (D-2). Si alguna vez se quiere endurecer, la alternativa real es una cookie `HttpOnly` emitida por el Bridge, lo que cambia el contrato del backend y excede este change.
- **La validación de expiración depende del reloj del visitante.** → Un reloj mal puesto produce un falso "vigente" (el usuario ve el formulario y recibe `401` al enviar) o un logout prematuro. El `401` del Bridge, manejado en CHANGE-16, es la red de contención; el cliente nunca es la autoridad (D-5).
- **La sesión sigue "abierta" en memoria si el token vence con la pestaña abierta.** → Por diseño: este change valida en la hidratación. La expiración en vuelo la detecta el interceptor de CHANGE-16 al recibir el `401`, y ahí sí corresponde llamar a `logout()`. Declarado como Non-Goal para que no se lea como olvido.
- **La falla cerrada de D-1 puede desloguear a alguien con un token legítimo si la decodificación tiene un bug** (típicamente base64url mal traducido). → El spec fija los casos de base64url con `-`/`_` y sin relleno como escenarios de primera clase, y la triangulación del ciclo TDD los cubre antes de que exista un token real que probar.
- **El destello del muro antes de hidratar (D-6) no se ve hoy porque todavía no hay UI que ramifique.** → Aparece recién en CHANGE-19/20, cuando arreglarlo cuesta más. Por eso la decisión y su salida (`isHydrated`) quedan escritas acá, no diferidas.
- **La sesión no se sincroniza entre pestañas.** → Cerrar sesión en una pestaña deja a la otra autenticada en memoria hasta que recargue. Aceptado: ningún criterio de aceptación lo pide, y el evento `storage` agregaría comportamiento no especificado.
- **Divergencia declarada con la tabla del KB ("Zustand + persist") y con el criterio de fallo ruidoso de `env.ts`.** → Ambas son deliberadas y están argumentadas (D-7, D-4). Se anotan como divergencias para que una lectura futura del KB no las tome por error de implementación.

## Migration Plan

No hay migración de datos: no existe ninguna sesión previa en el navegador de ningún usuario, porque hoy la aplicación no escribe nada en `localStorage` (`shared/config/env.ts` sólo lee variables de build). El primer usuario que inicie sesión estrena la clave `wasa.auth`.

Rollback: revertir el commit. Los únicos artefactos que quedarían en navegadores que hayan usado la versión con sesión son las claves `wasa.auth` huérfanas — inertes, sin ningún lector, y eliminables por el usuario limpiando los datos del sitio. Ningún cambio de esquema, de configuración ni de backend acompaña a este change.

## Open Questions

- **¿El Dashboard React/Node.js existente se sirve desde el mismo origen que la Landing?** Si lo hiciera, compartiría el `localStorage` y valdría revisar que la clave `wasa.auth` (D-3) no colisione con alguna suya. No cambia el diseño —el prefijo `wasa.` ya acota el espacio de nombres— y puede verificarse en CHANGE-20, cuando se implemente la redirección al Dashboard (RN-WS-08).
- **¿Qué hace CHANGE-16 exactamente al recibir un `401` del Bridge: `logout()` a secas, o `logout()` más un mensaje al usuario?** Es una decisión de aquel change; no afecta a las specs ni a la forma del estado de éste, que ya expone `logout()` como operación local completa.
