## Context

Ver `proposal.md` — Why. Lo que sigue es sólo el estado actual que condiciona el cómo.

**Lo que ya existe y no se toca.** `GET /api/v1/dashboard` está implementado y archivado (CHANGE-25). El router declara `prefix="/api/v1/dashboard"` con `@router.get("")`, así que la ruta exacta es `/api/v1/dashboard`, sin barra final. Sus schemas (`fastapi_bridge/schemas/dashboard_schemas.py`) declaran **todas** las columnas opcionales (`| None = None`) y `model_config = ConfigDict(extra="allow")`: la respuesta es deliberadamente abierta, porque el esquema de `scans`/`vulnerabilities` pertenece al sistema WASA existente y puede incorporar columnas sin que el Bridge se entere. `scan_date` viaja como `str | None`.

**Lo que hay que portar.** `dashboard/dashboard-fuzzing/src/App.jsx` es un único componente de ~330 líneas que mezcla cuatro responsabilidades: el `useEffect` que hace `fetch('http://localhost:5000/api/dashboard?…')`, siete derivaciones calculadas inline en el cuerpo del render (`severityCounts`, `severityData`, `trendData`, `endpointCounts`, `topEndpoints`, los tres KPIs), el estado de vista/filtros/modal, y todo el marcado de las tres vistas más el modal. `src/components/Sidebar.jsx` es un conmutador de vistas de tres botones. El estilo es CSS suelto (`App.css`, `Sidebar.css`) con clases propias (`kpi-card`, `badge-Critical`, `modal-overlay`).

**Restricciones del destino.** `wasa-landing` es FSD estricto con la dirección `app → pages → widgets → features → entities → shared` anclada por `tests/fsd-boundaries.test.ts` (recorre el AST de cada `.ts`/`.tsx` bajo `src/` y falla ante cualquier import que resuelva a una capa anterior). `src/shared/config/env.ts` es la única lectura de `import.meta.env` del árbol, anclada por spec. `axiosInstance` es el único cliente HTTP, con interceptor de credencial e interceptor de `401` cableados desde `app/providers/httpClientProvider.ts`. El patrón de widget establecido en CHANGE-19/24 es: contenido y clases Tailwind declarados como constantes en `model/` y en la cabecera del `.tsx`, marcado que sólo itera. `shared/ui/Modal.tsx` existe, es controlado (`isOpen`/`onClose`), cierra con Escape y con clic en el backdrop, y bloquea el scroll del body.

**Deuda heredada que este change hereda.** El `App.jsx` original hace `console.log(dbData)` en cada carga —volcando URLs objetivo y evidencias de todos los usuarios por consola— y hace `vuln.severity.charAt(0)` sin guarda, que revienta con una severidad nula que el contrato del Bridge permite explícitamente.

**Un hallazgo previo al propose.** Las capabilities `about-page` y `scan-pending-screen` que CHANGE-24 declaró como nuevas **no** quedaron creadas bajo `openspec/specs/` al archivarse (`openspec/changes/archive/2026-08-31-frontend-info-and-pending-screens/specs/` las tiene, `openspec/specs/` no). No bloquea este change —ver Open Questions—, pero explica por qué el requisito sobre la salida "Ver el Dashboard" de la pantalla de espera vive en el spec nuevo `dashboard-screen` y no en un delta de `scan-pending-screen`: no hay spec vigente contra el cual escribir ese delta.

## Goals / Non-Goals

**Goals:**

- Paridad funcional observable con `dashboard-fuzzing`: mismos indicadores, mismos gráficos, mismas tablas, mismos filtros, mismo modal.
- Sacar la derivación de métricas del render y convertirla en funciones puras testeables sin montar React ni tocar la red.
- Una sola dirección de red en toda la aplicación (`VITE_API_BASE_URL`), y una sola aplicación que levantar.
- Tolerancia real al esquema abierto del Bridge: ningún campo ausente, nulo o desconocido debe tumbar la pantalla.

**Non-Goals:**

- Rediseñar el aspecto visual. Se porta el marcado a Tailwind con un tema oscuro coherente con el resto de la aplicación, pero la armonización con el sistema de diseño es CHANGE-27. Este change no inventa una identidad visual nueva para el dashboard.
- Mejorar el contrato del Bridge (paginación, orden de `vulnerabilities`, límites, caché). Si la pantalla necesita algo que el Bridge no da, se resuelve en el frontend.
- Agregar autenticación o filtrado por usuario. Decisión de producto ya tomada, codificada en `dashboard-endpoint` y repetida en `dashboard-screen`.
- Reescribir `shared/ui/Modal.tsx` para servir a dos consumidores con anchos distintos.

## Decisions

### D-1: `recharts` se adopta como dependencia de runtime, en su versión mayor 3

**Decisión.** `recharts@^3` entra en `dependencies` de `wasa-landing/package.json`.

**Por qué.** Es exactamente la librería que `dashboard-fuzzing` ya usa (`^3.8.0`), así que los cuatro gráficos se portan cambiando los tipos y no la lógica: `PieChart`/`Pie`/`Cell`, `LineChart`/`Line`/`XAxis`/`YAxis`/`CartesianGrid`, `Tooltip`, `Legend` y `ResponsiveContainer` mantienen su API. Trae sus propios tipos TypeScript, así que no hace falta un `@types/*` aparte. Y `recharts@3` declara React 19 en sus `peerDependencies`, que es la versión que `wasa-landing` corre.

**Alternativas consideradas.** *Dibujar los dos gráficos a mano en SVG* — evita ~500 KB de dependencia y el proyecto ya escribe SVG inline (los íconos del `Navbar`), pero implica reimplementar arcos de un donut, escalas, ejes, ticks rotados, tooltips y leyenda: es más superficie propia que mantener que la que ahorra, y el riesgo de divergir del comportamiento actual es alto. *Cambiar a otra librería* (`visx`, `chart.js`, `nivo`) — todas obligan a reescribir los gráficos desde cero para no ganar nada observable. La adopción es la opción con menor diff funcional, que es el criterio del roadmap para este change.

**Consecuencia a vigilar.** Es la primera dependencia de runtime pesada de la aplicación. `tests/manifest.test.ts` y el requisito "Dependencias del stack frontend disponibles" de `landing-bootstrap` se actualizan para incluirla explícitamente, de modo que su presencia sea una decisión declarada y no un arrastre.

### D-2: La respuesta se tipa como **abierta**, con TypeScript y sin Zod

**Decisión.** `entities/dashboard/model/types.ts` declara:

```ts
interface DashboardScanRow { id?: number | null; target_url?: string | null; scan_date?: string | null; /* … */ [key: string]: unknown }
interface DashboardVulnerabilityRow { id?: number | null; scan_id?: number | null; severity?: string | null; /* … */ [key: string]: unknown }
interface DashboardResponse { scans: DashboardScanRow[]; vulnerabilities: DashboardVulnerabilityRow[] }
```

Todos los campos conocidos opcionales y nulables, más un index signature que admite las columnas no documentadas. Nombres en `snake_case`, igual que el cable, siguiendo el criterio ya establecido en `entities/scan/model/types.ts` ("un renombrado silencioso convierte un contrato verificable en una traducción que nadie ejercita hasta que rompe"). No se escribe ningún schema Zod para la respuesta.

**Por qué.** El espejo del backend tiene que ser fiel: `ScanRow`/`VulnerabilityRow` son `extra="allow"` con todo opcional, así que un tipo cerrado y obligatorio del lado del frontend mentiría sobre lo que efectivamente llega. Y el proyecto ya tiene un criterio para esto: `ScanResponse` es un tipo y no un schema, "nadie los parsea en runtime". Zod aportaría poco y costaría mucho: un `.passthrough()` con todo `.optional().nullable()` no rechaza prácticamente nada, y `safeParse` sobre cientos de filas en cada cambio de filtro es trabajo sin contrapartida. Lo que sí protege de verdad es que **cada consumidor** tolere el campo ausente, y eso lo garantiza el tipo opcional en el punto de uso, no una validación en el borde.

**Alternativas consideradas.** *Zod con `.passthrough()`* — rechazado por lo anterior. *Tipos cerrados y obligatorios con un cast en el borde* — es la opción que rompe: `severity: string` obligatorio es exactamente la mentira que hace que `vuln.severity.charAt(0)` reviente en producción con la severidad nula que el contrato permite. *`unknown` + guards en cada uso* — correcto pero ilegible en cincuenta puntos de acceso.

**Regla derivada.** Ninguna función de derivación (D-3) accede a un campo sin considerar `undefined`/`null`. Los tests de `dashboard-metrics` incluyen filas incompletas como caso normal, no como caso raro.

### D-3: La derivación de métricas vive en `entities/dashboard/`, como funciones puras

**Decisión.** Las siete derivaciones que hoy están inline en el render de `App.jsx` se convierten en funciones puras exportadas por `entities/dashboard/lib/` (o `model/`): normalización de severidad, KPIs, distribución por severidad, serie de evolución y ranking de endpoints. Reciben la respuesta ya recibida y devuelven estructuras planas. No importan React, no leen estado, no hacen red.

**Por qué.** Es la única forma de que `dashboard-metrics` sea testeable como spec: cada escenario ("la distribución suma el total", "un escaneo sin vulnerabilidades figura con cero", "una vulnerabilidad huérfana no rompe la serie") es un test de una función con una entrada y una salida, sin montar un componente ni interceptar red. Cabe en `entities/` porque es conocimiento de dominio compartido entre widgets —los KPIs y el gráfico de severidad leen la misma distribución— y `entities/` es la capa que el proyecto ya usa para "tipos, schemas y estado de dominio compartido entre features". No cabe en `shared/`: `shared/` no conoce dominio WASA, y esto es puro dominio WASA.

**Alternativa considerada.** Dejar las derivaciones dentro del hook de datos en `features/`. Se rechaza porque las ata a React (`useMemo`) y obliga a montar un hook para testear una suma.

### D-4: Dos correcciones deliberadas de paridad respecto del original

El objetivo es paridad **funcional**, no reproducción de defectos. Dos comportamientos del original no se portan:

1. **`console.log(dbData)` no se porta.** Volcaba la respuesta completa —URLs objetivo y evidencias de vulnerabilidades de todos los usuarios— por la consola del navegador en cada carga. Anclado por el requisito "Montar la pantalla de resultados no ensucia la consola" de `dashboard-screen`, en línea con `tests/landing-console-clean.test.tsx` que la aplicación ya tiene.
2. **La normalización de severidad se vuelve total.** El original hace `vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)` sin guarda; con `severity: null` —que el contrato del Bridge permite explícitamente— eso lanza y deja la pantalla en blanco. La versión portada normaliza cualquier valor y agrupa el ausente bajo una categoría explícita de severidad desconocida.

Una tercera diferencia es consecuencia del backend, no una decisión de este change: el original manda `scan_id` como string y `server-fuzzing` respondía `500` ante un valor no numérico; el Bridge lo coerciona y responde `422`. La pantalla nunca produce ese caso, porque las opciones del filtro salen de los escaneos devueltos.

### D-5: El `Sidebar` se convierte en una barra de vistas horizontal dentro de la página

**Decisión.** Los tres botones de `Sidebar.jsx` se portan como un conmutador de vistas dentro de `DashboardPage`, no como una barra lateral fija a la izquierda del viewport. El encabezado del `Sidebar` original ("Dashboard de Seguridad Web / Equipo Bot Azul") se porta como encabezado de la página.

**Por qué.** `wasa-landing` tiene un `Navbar` fijo superior en todas las rutas, montado por `App.tsx` fuera del `Routes`. Un `aside` fijo a la izquierda compitiendo con él daría dos cromos de navegación simultáneos, y el `Navbar` es el que el usuario ya conoce del resto de la aplicación. El conmutador de tres vistas es navegación **interna a la pantalla**, no de la aplicación, así que su lugar natural es dentro de la página.

**Consecuencia.** Las tres vistas siguen siendo estado local de la pantalla, no rutas (`/dashboard/endpoints` no existe). Conmutar no debe reconsultar ni perder filtros — anclado en `dashboard-screen`.

### D-6: Un modal propio para el detalle, no `shared/ui/Modal`

**Decisión.** El detalle de vulnerabilidad usa un componente propio del widget de detalle, no `shared/ui/Modal.tsx`.

**Por qué.** El `Modal` compartido está fijado en `max-w-md` y su cuerpo es un slot opaco pensado para formularios de auth. El detalle de una vulnerabilidad es una grilla de metadatos de dos columnas más URL, descripción, solución y un bloque de evidencia que puede ser largo: entra en conflicto directo con ese ancho. Ensanchar el `Modal` compartido o parametrizarlo cambiaría un primitivo que ya tiene dos consumidores y su propio spec (`shared-ui-kit`), por un requisito de un solo consumidor.

**Trade-off aceptado.** Se duplica el comportamiento de cierre por Escape, cierre por backdrop y bloqueo de scroll. Es duplicación real y hay que escribirla bien (el `Modal` compartido ya documenta las tres trampas: listener sólo mientras está abierto, `target === currentTarget` en vez de `stopPropagation`, y restaurar el `overflow` previo en vez de asumir `""`). Si CHANGE-27 unifica el sistema de diseño, ese es el momento de parametrizar el ancho del primitivo compartido y colapsar los dos.

**Alternativa considerada.** Un panel expandible en la propia fila en vez de un modal. Cambia el comportamiento observable respecto del original sin necesidad.

### D-7: La carga de datos vive en un hook de `features/dashboard/`, con guarda de respuesta obsoleta

**Decisión.** `features/dashboard/api/fetchDashboard.ts` emite la consulta (misma forma que `features/scan-form/api/submitScan.ts`: `axiosInstance`, error traducido a una clase propia que transporta `status | null` y `ProblemDetails | null`). `features/dashboard/model/useDashboard.ts` posee el estado de filtros, dispara la consulta ante cada cambio y expone `{ data, isLoading, error, filters, setFilter }`.

Los parámetros ausentes **se omiten**, no se envían vacíos: se construye el objeto `params` de axios sólo con las claves seleccionadas. El Bridge trata la cadena vacía como ausente, pero depender de esa tolerancia es acoplarse a un detalle de su implementación.

**Guarda de obsolescencia.** Cada consulta lleva un identificador incremental; al resolver, si el identificador ya no es el vigente, la respuesta se descarta. Sin esto, tres cambios rápidos de filtro pueden dejar en pantalla el resultado del primero (`dashboard-client-requests`, "Respuesta tardía de un pedido superado"). Se implementa con un `ref` contador o con `AbortController` sobre la señal de axios; ambos satisfacen el spec, y la elección concreta queda en el `apply`. Durante una recarga los datos previos permanecen visibles y sólo la **primera** carga muestra el estado de carga a pantalla completa.

**Por qué en `features/` y no en `pages/`.** Es lógica de aplicación reutilizable con estado propio, y la dirección FSD permite que `widgets/` y `pages/` la consuman. Ponerla en la página la volvería inaccesible para los widgets sin prop drilling de seis niveles.

### D-8: `scan_date` se formatea con una función propia y tolerante, no con `new Date(...)` desnudo

**Decisión.** Una única función de `entities/dashboard/` produce las etiquetas de fecha (opciones del filtro de escaneo y puntos de la serie temporal). Recibe el `string | null | undefined` tal como llega, y devuelve una etiqueta legible o un marcador explícito si el valor falta o no es interpretable.

**Por qué.** R-4 del design de CHANGE-25 quedó abierto: `node-pg` emitía UTC con `Z`, mientras que Pydantic emite ISO-8601 **sin offset** si la columna es `TIMESTAMP WITHOUT TIME ZONE`, y `new Date("2026-08-31T14:00:00")` se interpreta como hora **local**. El riesgo es que las etiquetas de los gráficos se corran algunas horas respecto del dashboard actual. CHANGE-25 dejó dicho explícitamente que si aparece se resuelve acá, **nunca** transformando el dato en el backend. Concentrar el formateo en una función permite corregir el desfase en un solo lugar una vez que el smoke manual contra la base real diga qué formato llega. Además, `new Date(undefined)` da `Invalid Date` y `getHours()` sobre él da `NaN`: el original produciría `NaN/NaN - NaN:NaN:NaN` como etiqueta ante una fecha ausente, que el contrato permite.

**Qué queda abierto.** El desfase concreto no puede verificarse en este entorno (sin acceso a la instancia PostgreSQL real). Ver Open Questions.

### D-9: La baja de `VITE_DASHBOARD_URL` es un cambio transversal a la suite de tests

**Decisión.** `VITE_DASHBOARD_URL` se retira de `shared/config/env.ts`, de `vite-env.d.ts`, de `wasa-landing/.env.example` y del `README.md`. `readRequiredEnvVar` queda con un solo nombre en su unión de tipos.

**Por qué se hace ahora y no se difiere.** Mientras la variable siga siendo *requerida*, todo despliegue tiene que declarar un valor que ningún módulo lee, y el módulo de configuración falla ruidosamente al arrancar si no está — falla por una dependencia que ya no existe.

**Superficie afectada, que es más grande de lo que parece.** No alcanza con editar `env.ts`: la suite tiene `vi.stubEnv('VITE_DASHBOARD_URL', …)` repartido en `tests/setup.ts` y en varios archivos de auth y de scan, más tests que giran enteramente alrededor de la variable (`tests/env.test.ts`), del enlace externo del `Navbar` (`tests/navbar.test.tsx`) y de la salida de la pantalla de espera (`tests/scan-pending-widget.test.tsx`). Todos se actualizan en el mismo grupo de tareas, y el criterio es **cambiar la aserción, no borrarla**: donde hoy se afirma "el enlace apunta a `dashboardUrl` y abre en pestaña nueva", mañana se afirma "es un enlace interno a `/dashboard` en la misma pestaña".

**Lo que NO se toca.** `tests/scan-form-no-redirect.test.ts` construye fixtures con el literal `dashboardUrl` para verificar su propio detector de redirecciones; ese archivo sigue siendo válido y no se modifica.

### D-10: El retiro físico de `dashboard/` se decide en el `apply`, no acá

**Decisión.** Este change deja `dashboard/dashboard-fuzzing` y `dashboard/server-fuzzing` **fuera del flujo de arranque documentado** —README (puesta en marcha, diagrama de capas, estructura del repositorio, tabla de variables de entorno), y cualquier script que los levante— pero **no** decide si las carpetas se eliminan, se mueven a un directorio de legado o se dejan donde están. Esa decisión se toma con el usuario durante el `apply`, y la tarea correspondiente está marcada como bloqueante.

**Por qué se difiere.** Las tres opciones son razonables y la elección es del usuario, no técnica: es un proyecto de tesis y esas carpetas son la implementación original que la tesis documenta. Eliminarlas es reversible por git pero afecta lo que un lector del repositorio encuentra; moverlas a `legacy/` conserva la trazabilidad al costo de una carpeta muerta; dejarlas quietas y sólo sacarlas del README es lo más conservador pero deja dos proyectos que alguien puede levantar por error. Ninguna opción cambia los specs, el enfoque ni el desglose de tareas — que es exactamente el criterio para diferir.

**Lo que sí queda fijo.** Sea cual sea el destino, al terminar el change: el README no instruye levantarlos, `VITE_DASHBOARD_URL` no existe, el puerto 5000 queda libre, y la única forma documentada de ver resultados es `/dashboard` en la Landing.

### D-11: Los gráficos se prueban por sus datos, no por su SVG

**Decisión.** Los tests de los widgets de gráficos afirman sobre las estructuras que se le pasan a `recharts` y sobre lo que rodea al gráfico (título, estado vacío), no sobre los nodos SVG que `recharts` renderiza.

**Por qué.** `ResponsiveContainer` mide su contenedor, y en jsdom todo mide `0×0`: en la práctica no dibuja nada, así que un test que busque un `path` de un arco no falla por una regresión sino por el entorno. Afirmar sobre el SVG además ataría los tests a detalles internos de la librería. La cobertura real de los gráficos está en `dashboard-metrics`, donde las series se prueban como datos puros — que es justamente por qué D-3 las saca del render.

## Risks / Trade-offs

**R-1 — El desfase horario de `scan_date` (R-4 de CHANGE-25) sigue sin verificar.** Sin acceso a `db_fuzzing` real no se sabe si la columna es `TIMESTAMP WITHOUT TIME ZONE` ni qué emite Pydantic. Las etiquetas de los gráficos podrían correrse algunas horas respecto del dashboard actual. → *Mitigación*: D-8 concentra todo el formateo de fecha en una función, así que la corrección es de un solo punto; y el `apply` incluye una tarea de smoke manual que compara las etiquetas contra el dashboard standalone **antes** de retirarlo.

**R-2 — Volumen sin paginar.** El endpoint no pagina ni limita (decisión explícita de CHANGE-25: "el volumen actual es de tesis, no de producción"). La pantalla renderiza la tabla de detalle completa en el DOM. Con unos pocos miles de vulnerabilidades la tabla se vuelve lenta. → *Mitigación*: se acepta, es paridad con el comportamiento actual. El filtro por escaneo es la vía de escape natural. Si aparece, se resuelve con virtualización en el frontend, no cambiando el contrato.

**R-3 — El esquema compartido puede cambiar bajo nuestros pies (R-5 de CHANGE-25, ahora visible en la UI).** Si n8n renombra una columna, el endpoint sigue respondiendo `200` y el síntoma aparece como una columna vacía en la tabla o un gráfico plano. → *Mitigación*: es el precio explícito de la tolerancia de D-2, y es preferible a una pantalla en blanco. El estado vacío explícito de `dashboard-screen` hace que "no hay datos" se lea como tal y no como una tabla rota.

**R-4 — La pantalla es pública y muestra datos de todos los usuarios.** Cualquiera que alcance la Landing ve las URLs objetivo, las evidencias y las vulnerabilidades de todos los escaneos, de todos los usuarios. → *Mitigación*: ninguna en este change. Es riesgo **heredado**, no introducido: el dashboard standalone ya se comportaba así y el propietario del producto confirmó dos veces que la pantalla unificada debe comportarse exactamente igual. Lo que sí cambia es que ahora esos datos quedan bajo el mismo origen que la Landing, así que el riesgo pasa a ser más fácil de alcanzar. Se registra explícitamente acá para que cerrarlo sea una decisión consciente en un change propio, no un olvido. Ver Open Questions.

**R-5 — La baja de `VITE_DASHBOARD_URL` toca más tests de los que el change "parece" tocar.** Un `stubEnv` olvidado en una suite de auth deja esa suite en rojo por un motivo que no tiene nada que ver con auth. → *Mitigación*: D-9 enumera la superficie y el grupo de tareas correspondiente barre por búsqueda de texto en todo `tests/`, no archivo por archivo de memoria.

**R-6 — `recharts` es la primera dependencia de runtime pesada del frontend.** Aumenta el tamaño del bundle de producción de toda la aplicación, incluida la página de inicio que no usa gráficos. → *Mitigación*: aceptado por D-1. Si el peso molesta, `DashboardPage` es candidato natural a carga diferida (`React.lazy`) sin cambiar nada de lo que este change decide — pero no se hace acá: sería optimización sin medición.

**R-7 — Duplicación del comportamiento de modal (D-6).** Dos implementaciones de cierre por Escape/backdrop y bloqueo de scroll pueden divergir. → *Mitigación*: el modal nuevo se escribe replicando las tres trampas ya documentadas en `shared/ui/Modal.tsx`, y CHANGE-27 es el lugar previsto para colapsarlas.

## Migration Plan

**No hay migración de datos ni de esquema.** El cambio es de frontend y de configuración.

**Orden de despliegue.** El Bridge ya expone `GET /api/v1/dashboard` (CHANGE-25 desplegado), así que la Landing nueva puede desplegarse sin coordinación. El dashboard standalone puede seguir corriendo en paralelo durante el smoke de R-1 —ambos leen la misma base, no hay conflicto— y recién después retirarse.

**Configuración.** `VITE_DASHBOARD_URL` deja de leerse. Un despliegue que la siga declarando no falla; uno que la omitía y fallaba al arrancar, ahora arranca. No hay variable nueva que agregar. Del lado del Bridge no hay nada que reconfigurar: `CORS_ORIGINS` ya incluye el origen de la Landing, que es el mismo desde el que ahora sale la consulta de resultados.

**Rollback.** Volver a la versión anterior de la Landing y redeclarar `VITE_DASHBOARD_URL`. Mientras el retiro físico de `dashboard/` no se haya ejecutado (D-10), el rollback es completo. Una vez ejecutado, sigue siendo posible por git pero requiere restaurar las carpetas — razón adicional para que el retiro físico sea el **último** paso del change, después del smoke manual.

## Open Questions

1. **¿Qué formato de `scan_date` emite el Bridge contra `db_fuzzing` real, y hay desfase horario?** (R-1, D-8.) Se responde con el smoke manual del `apply`. No cambia los specs ni el desglose de tareas: la función de formateo existe igual, y sólo se ajusta su implementación interna.
2. **¿Las carpetas `dashboard/dashboard-fuzzing` y `dashboard/server-fuzzing` se eliminan, se mueven a un directorio de legado, o se dejan donde están?** (D-10.) Decisión del usuario, a tomar en el `apply`. No cambia specs ni tareas: la tarea existe con las tres opciones y el resultado documentado.
3. **¿Cuándo se cierra el acceso público a los resultados?** (R-4.) Fuera de alcance por decisión explícita del propietario. Queda registrado como candidato a un change propio, no como pendiente de este.
4. **¿Hay que reconstruir las capabilities `about-page` y `scan-pending-screen` en `openspec/specs/`?** El archivado de CHANGE-24 no las creó. No bloquea este change —ningún delta de acá las referencia—, pero conviene resolverlo antes de archivar `dashboard-frontend-migration`, o el hueco se agranda.
