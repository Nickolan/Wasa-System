## Context

Ver `proposal.md` § Why para la motivación. Acá sólo lo que condiciona el **cómo**.

**Estado verificado del código (2026-08-31)**

| Hecho | Dónde | Por qué importa |
|---|---|---|
| La redirección vive en un `useEffect` del hook, no en el `then` del submit | `features/scan-form/model/useScanForm.ts:151-157` | Quitarla es local: se borran el efecto, `SUCCESS_REDIRECT_DELAY_MS` y el import de `dashboardUrl`. Nada más del hook depende de ellos. |
| `scanResponse` es estado **del hook**, y el hook lo consume sólo `ScanForm` | `features/scan-form/ui/ScanForm.tsx:18` | Si la pantalla de espera vive fuera del feature, ese estado tiene que subir. Es la decisión D-1. |
| El router monta `/` → `HomePage` y `/scan` → `ScanPage` | `app/App.tsx:21-22` | `/about` es una línea más. Sin `lazy`, sin layout nuevo. |
| **⚠️ SUPERADO (2026-08-31, post-propose) — `pages/LandingPage` ya NO existe.** Se retiró como parte de un fix de deuda de tests previo a este `apply` (no como parte de este change): estaba huérfano del routing desde `a799400` y estructuralmente roto (pasaba props a `HeroWidget` que ya no acepta). `openspec/specs/landing-bootstrap/spec.md` fue actualizado para reflejarlo. **D-2 de abajo queda obsoleta** — `ScanFormWidget` ya no tiene un segundo consumidor sin `onAccepted`; `ScanPage` es su único consumidor. | (archivo eliminado) | Invalida el "camino por defecto" que D-2 usaba como red de seguridad. Ver nota al pie de D-2. |
| El aviso ético y el muro de autenticación viven en `ScanFormWidget`, no en `ScanForm` | `widgets/scan-form/ui/ScanFormWidget.tsx:52-79` | Si la página reemplaza al widget entero, el aviso ético desaparece durante la espera. Aceptable: el requirement que lo obliga (`landing-composition`) aplica a la Landing, no a `/scan`. |
| El contenido estático se modela como datos en `model/`, no como JSX repetido | `widgets/features-section/model/tools.ts`, `widgets/how-it-works/model/steps.ts` | Patrón ya establecido (D-9 de CHANGE-19). La página informativa lo hereda. |
| `TOOLS` y `STEPS` **no** se exportan desde el `index.ts` de su slice | ídem | Son detalle interno. Ningún otro widget puede reutilizarlos sin romper el encapsulamiento de slice. Condiciona D-6. |
| Los tests que hay que tocar sustituyen `window.location` con `Object.defineProperty` | `tests/use-scan-form.test.tsx:393-505`, `tests/scan-form.test.tsx:157-240` | Al desaparecer la navegación, toda esa maquinaria de sustitución se vuelve innecesaria: se borra, no se adapta. |
| `VITE_DASHBOARD_URL` la consume también el `Navbar` | `widgets/navbar/ui/Navbar.tsx:71,114` | Quitarla del hook **no** la deja huérfana. `shared/config/env.ts` no se toca. |

**Restricciones**

- FSD unidireccional (`app → pages → widgets → features → entities → shared`). Un feature **no puede** importar un widget. Esto es lo que hace que D-1 sea una decisión y no un detalle.
- Governance BAJO, salvo el copy de privacidad de `/about`, que es una afirmación pública sobre datos de usuarios — se surface en D-7 en vez de resolverse en el `apply`.
- Sin dependencias nuevas. Tailwind y `react-router-dom` ya están.

## Goals / Non-Goals

**Goals**

- Que la aceptación de un escaneo termine en una pantalla que **explica** en vez de en una expulsión.
- Que exista un solo lugar en el código donde se decide a dónde puede ir el usuario desde la espera, para que CHANGE-26 lo reapunte a `/dashboard` cambiando una constante.
- Que el contenido informativo sea **datos**, no JSX, para que los tests afirmen sobre las constantes y no repitan literales.

**Non-Goals**

- **No** se consulta el estado real del escaneo. No hay endpoint para eso en el Bridge y este change no lo crea: los "~10 minutos" son una expectativa declarada, no una cuenta regresiva ni un polling. (Ver D-5.)
- **No** se rehace `HomePage` ni sus widgets. La página informativa profundiza; no reemplaza a `FeaturesWidget` ni a `HowItWorksWidget`.
- **No** se retira `pages/LandingPage` ni se toca su spec **como parte del scope de este change** — ya fue retirado por un fix de deuda de tests aparte, previo al `apply` (ver nota SUPERADO en la tabla de arriba y D-2).
- **No** se da de baja `VITE_DASHBOARD_URL` ni se retira el Dashboard standalone. Eso es CHANGE-26.
- **No** se introduce paleta ni tokens nuevos. La armonización visual es CHANGE-27.

## Decisions

### D-1 — La pantalla de espera es un **widget**, y el estado de aceptación sube hasta `ScanPage`

**Decisión.** `widgets/scan-pending/ui/ScanPendingWidget.tsx` (contenido en `model/`), renderizado por `pages/ScanPage` **en lugar de** `ScanFormWidget` cuando el escaneo fue aceptado. El estado sube por props opcionales:

```
ScanPage  ── acceptedScan: ScanResponse | null (useState)
   ├── !accepted → <ScanFormWidget onScanAccepted={setAcceptedScan} … />
   │                   └── <ScanForm onAccepted={onScanAccepted} />
   │                           └── useScanForm() → useEffect: scanResponse ≠ null → onAccepted(scanResponse) (una sola vez)
   └──  accepted → <ScanPendingWidget scan={acceptedScan} />
```

**Por qué.** La pantalla de espera tiene encabezado propio, texto de varios párrafos y acciones de navegación: es una sección de página, es decir un widget por la definición FSD del proyecto. Además, el encabezado de `ScanPage` ("Iniciar Escaneo" + su bajada) también deja de ser cierto durante la espera, y **sólo la página puede cambiarlo**. Con el estado dentro del feature, la página seguiría anunciando "Iniciar Escaneo" sobre una pantalla que dice que el escaneo ya arrancó.

**Alternativa descartada — que el propio `ScanForm` renderice la espera.** Sería más barato (cero plumbing, y `LandingPage` la heredaría gratis), pero: (i) FSD prohíbe que el feature importe el widget, así que el panel tendría que vivir dentro del feature o en `shared/ui`, y un panel con copy de dominio WASA en `shared/` viola la regla dura de que `shared/` no conoce el dominio; (ii) el encabezado de la página quedaría desincronizado; (iii) el enlace de salida necesita `<Link>`, que exige contexto de Router y rompería todos los tests que hoy renderizan `ScanForm` suelto.

**Alternativa descartada — mover `scanResponse` a un store de `entities/scan`.** Estado global para algo que vive y muere dentro de una página. Sumaría un store que después hay que limpiar al desmontar, y ninguna otra parte de la app lo lee.

**Nota de implementación.** El callback se dispara desde un `useEffect` sobre `scanResponse` (no desde el `try` del submit) por la misma razón por la que la redirección estaba ahí: es un efecto de la transición de estado, y así respeta el desmontaje. Debe dispararse **una sola vez** — `succeededRef` ya garantiza que `scanResponse` se setea una única vez, así que la dependencia `[scanResponse, onAccepted]` alcanza siempre que `onAccepted` sea estable (`useCallback` en `ScanPage`).

### D-2 — `pages/LandingPage` no se toca, y el mensaje inline de éxito se reformula para no mentir

> **⚠️ Nota post-propose (2026-08-31): la premisa de esta decisión quedó superada antes del `apply`.** `pages/LandingPage` fue retirado por un fix de deuda de tests aparte (no por este change) — estaba huérfano del routing y roto contra la implementación actual de `HeroWidget`. `tests/landing-page.test.tsx` también se eliminó (su único test con valor propio pasó a `tests/app-hydration.test.tsx`); `openspec/specs/landing-bootstrap/spec.md` ya no describe `LandingPage`. **Consecuencia práctica:** `ScanFormWidget` ya no tiene un segundo consumidor que lo monte sin `onAccepted` — hoy `ScanPage` es su único consumidor. El razonamiento original de esta decisión (dejar `LandingPage` como "camino por defecto" de prueba viva) ya no aplica tal cual: no hay que preservar comportamiento para un componente que no existe. Lo que **sigue vigente** es mantener el prop `onAccepted` opcional (buena práctica de API y cubre los tests unitarios que renderizan `ScanForm`/`ScanFormWidget` sueltos) y la reformulación de `SCAN_SUCCESS_MESSAGE` de abajo, que sigue siendo necesaria dondequiera que se ejercite ese camino por defecto (tests incluidos). El retiro de `LandingPage`, que este design.md tenía anotado como deuda para `CHANGE-27`, ya está resuelto — no hace falta repetirlo ahí.

**Decisión (histórica, contexto del propose).** `LandingPage` sigue existiendo, sigue componiendo `ScanFormWidget` y **no** recibe la pantalla de espera. Como no pasa `onScanAccepted`, su `ScanForm` cae en el comportamiento por defecto: muestra su confirmación inline `role="status"` y no navega a ninguna parte.

Pero `SCAN_SUCCESS_MESSAGE` dice hoy *"Escaneo encolado. Te llevamos al Dashboard para seguir el progreso…"*. Eso deja de ser verdad en cuanto se borra el `useEffect`. **Se reformula** a una confirmación neutra que no promete navegación y que menciona el email — de modo que el texto sea correcto tanto donde hay pantalla de espera como donde no. **Esta parte de la decisión sigue vigente.**

**Por qué no retirar `LandingPage` (histórico, ya no aplica).** Estaba cubierta por la spec `landing-composition`/`landing-bootstrap` y por `tests/landing-page.test.tsx` (nueve bloques de tests). Su retiro terminó ocurriendo como efecto colateral autorizado de un fix de deuda de tests, no de este change — pero el resultado final (LandingPage no existe) es el mismo que hubiera dejado un `CHANGE-27` que la retirara.

### D-3 — El copy de la pantalla de espera vive en constantes exportadas, no en el JSX

**Decisión.** `widgets/scan-pending/model/copy.ts` exporta las cadenas; el componente sólo las coloca. Los tests afirman sobre las constantes, nunca sobre el literal — mismo criterio que `SCAN_SUBMIT_MESSAGES` en el feature.

**Texto propuesto (a revisar por el usuario):**

- Encabezado: **"Tu escaneo está en curso"**
- Estado: *"Recibimos tu solicitud y el análisis ya arrancó. Estamos ejecutando ZAP, Nuclei, ffuf y SQLMap sobre el objetivo que indicaste."*
- Duración: *"El escaneo completo tarda aproximadamente 10 minutos. Es una estimación: puede variar según el tamaño del sitio objetivo."*
- Email: *"Cuando termine, te enviamos el reporte con los hallazgos por correo electrónico, a la casilla de la cuenta con la que iniciaste sesión. No hace falta que dejes esta página abierta."*

La última frase es deliberada: la spec exige no pedirle al usuario que se quede, porque el envío lo hace n8n y no depende del navegador.

**Sobre el identificador del escaneo.** Se muestra como referencia discreta ("Referencia: `<scan_id>`"). Es útil para soporte y para cruzar contra el Dashboard. **No** se muestra el `message` que devuelve el Bridge: ese campo es un registro del orquestador, no texto de interfaz — mismo criterio que ya aplica D-12 de CHANGE-18 al `detail` de los errores.

### D-4 — Salidas: "Volver al inicio" (primaria) y "Ver el Dashboard" (secundaria), sin "lanzar otro escaneo"

**Decisión.**

- Primaria: `<Link to="/">` — **Volver al inicio**. Navegación interna, sin recarga.
- Secundaria: enlace al Dashboard existente (`dashboardUrl`, `target="_blank"`), con el mismo tratamiento que ya tiene en el `Navbar`. Es el único lugar donde hoy se puede ver el progreso real.
- **No** hay acción de "lanzar otro escaneo" desde la pantalla de espera.

**Por qué el destino del Dashboard se lee desde el widget y no se hereda.** Queda en **una sola constante del widget**: cuando CHANGE-26 monte `/dashboard` dentro de esta aplicación, ese enlace externo pasa a ser un `<Link>` interno cambiando un archivo.

**Por qué no "lanzar otro escaneo".** Requeriría resetear el formulario y los guards (`succeededRef`), y el Bridge aplica rate limiting de 10 req/IP/60min sobre `/scan/start`: un botón que invita a reintentar empuja al usuario contra un `429` que la interfaz explica mal ("esperá un momento", sin decir cuánto — el `Retry-After` no está expuesto por CORS). El camino correcto para un segundo escaneo es volver a `/scan`, que ya funciona.

### D-5 — La pantalla de espera es estado en memoria: no sobrevive a un refresh

**Decisión.** `acceptedScan` es `useState` de la página. Si el usuario recarga `/scan`, vuelve a ver el formulario.

**Por qué.** Persistirlo (localStorage) obligaría a decidir cuándo se limpia, y **no hay forma de saberlo**: el Bridge no expone un endpoint de estado de escaneo, y el único evento de finalización es un email que la aplicación no ve. Una pantalla persistida que dijera "tu escaneo está en curso" tres días después sería falsa. Un vencimiento por tiempo (p. ej. 10 minutos) sería una cuenta regresiva disfrazada que tampoco refleja la realidad.

**Trade-off aceptado.** Un refresh accidental pierde el aviso. Se mitiga con el email —que es el canal real de entrega y no depende del navegador— y con la referencia del `scan_id` a la vista antes del refresh.

### D-6 — La página informativa: un widget de contenido, con el contenido como datos, sin reutilizar `TOOLS`

**Decisión.** `pages/AboutPage/index.tsx` compone `<AboutWidget />` + `<FooterWidget />`. `widgets/about/model/sections.ts` modela las cuatro secciones obligatorias como datos (`{ id, title, body[] }`), siguiendo el patrón de `TOOLS`/`STEPS`.

**Por qué no reutilizar `TOOLS` de `features-section`.** No está exportado desde el `index.ts` de su slice —es detalle interno por decisión explícita de CHANGE-19— y en FSD estricto dos widgets no se importan entre sí. Exportarlo para reutilizarlo rompería ese encapsulamiento a cambio de deduplicar cuatro nombres de herramienta. Además, **el contenido no es el mismo**: `TOOLS` son descripciones de una línea para tarjetas de gancho; acá van párrafos. **La duplicación es deliberada.** Si más adelante duele, el lugar correcto para el catálogo compartido es `entities/`, no un widget — y eso es un change propio.

**Por qué un solo widget y no cuatro.** Las cuatro secciones son el mismo tipo de contenido con el mismo tratamiento visual: cuatro slices serían cuatro carpetas idénticas. Un widget que itera sobre los datos cumple igual el requisito de "sección identificable con su propio encabezado".

### D-7 — El copy de privacidad se escribe contra el código, no contra una política deseada ⚠️ **decisión a revisar por el usuario**

**Lo que el sistema efectivamente hace hoy** (verificado en el código, no supuesto):

| Dato | Qué pasa con él |
|---|---|
| Email y contraseña | La contraseña se almacena **hasheada con bcrypt**, nunca en texto plano. El email se guarda en la tabla `users` de `db_fuzzing`. |
| URL objetivo y PHPSESSID | Viajan al Bridge, se validan y se reenvían al workflow de n8n, que los usa para ejecutar las herramientas. Quedan asociados al escaneo en la base del sistema. |
| Email del usuario | Viaja con el escaneo hasta n8n para que el reporte se envíe a su casilla (CHANGE-23). El cliente **no puede** elegir otro destinatario: el campo no existe en el contrato de entrada. |
| Hallazgos | Se persisten en las tablas `scans` / `vulnerabilities` del sistema WASA. |
| Sesión | El token JWT vive en el `localStorage` del navegador del usuario. |

**Lo que NO se puede afirmar** porque el sistema no lo implementa: cifrado en reposo, política de retención o borrado automático, borrado a pedido, anonimización de los hallazgos, o cualquier certificación.

**Redacción propuesta:** describir la lista de arriba en lenguaje llano, cerrar con el aviso de uso autorizado (RN-WS-01) y con una frase que no prometa de más — del tipo *"WASA es un proyecto académico: los datos de tus escaneos quedan almacenados en la base del sistema y no se comparten con terceros, pero no ofrecemos todavía política de retención ni borrado a pedido."*

**Esto necesita el visto bueno del usuario antes del `apply`**: es lo único de este change que compromete al proyecto por escrito frente a un tercero. Si el usuario prefiere una redacción más corta o más conservadora, se ajusta el copy sin tocar ni la spec ni las tasks: el requisito es "las cuatro secciones existen y lo que afirman es verdadero", no un texto concreto.

### D-8 — Ruta `/about`, rótulo "Acerca de", tercera entrada del `Navbar`

**Decisión.** `NAV_LINKS` pasa a `[{ '/', 'Inicio' }, { '/about', 'Acerca de' }, { '/scan', 'Escanear' }]`.

**Por qué en esa posición.** El orden refleja el embudo: conocer → entender → actuar. "Escanear" queda pegado al botón de acción del Dashboard, que es la zona de acciones de la barra. `Acerca de` sobre `Info`/`Acerca` porque es la forma natural en español rioplatense y no se confunde con un ícono de ayuda.

El `Navbar` ya itera `NAV_LINKS` en escritorio y en móvil y ya aplica el estado activo por `location.pathname`: la entrada nueva hereda los tres escenarios de la spec sin código nuevo.

### D-9 — Los tests de redirección se **borran**, no se adaptan

**Decisión.** El bloque `describe('useScanForm — aceptación y redirección al Dashboard (8.1–8.6, D-11)')` de `tests/use-scan-form.test.tsx` y la sustitución de `window.location` de `tests/scan-form.test.tsx` se eliminan por completo, junto con sus `Object.defineProperty` de `beforeEach`/`afterEach`. En su lugar:

| Escenario viejo | Reemplazo |
|---|---|
| "tras el delay navega a `dashboardUrl`" | "tras la aceptación se invoca `onAccepted` con la respuesta, exactamente una vez" |
| "ningún rechazo redirige" | "ningún rechazo invoca `onAccepted`" (misma matriz de códigos: 401/400/422/429/502/red) |
| "desmontaje antes de la navegación" | "desmontar antes de que el efecto corra no invoca `onAccepted` ni propaga error" |
| "el destino es `dashboardUrl`, distinto de `apiBaseUrl`" | se elimina — ya no hay destino. La aserción de que las dos variables son distintas sigue viva en `tests/env.test.ts`. |

**Además**, un test nuevo de **no-regresión** que afirma lo contrario de lo que afirmaba el viejo: que ningún módulo de `features/scan-form/` importa `dashboardUrl` ni asigna `window.location`. Es la garantía de que la redirección no vuelve por descuido — el equivalente al test AST que ya usa el proyecto para `Base.metadata` en el backend.

### D-10 — El `## Purpose` de la spec `scan-submission` se actualiza a mano al archivar

La spec principal `openspec/specs/scan-submission/spec.md` abre diciendo que cubre *"la redirección al Dashboard de RN-WS-08"*. El delta no puede tocar el `Purpose` de una capability existente: hay que editarlo a mano. Queda como task explícita del grupo de cierre para que no se archive una spec cuyo propósito describe un comportamiento que ya no existe.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| El copy de privacidad afirma algo que el sistema no hace → afirmación falsa frente a un usuario real | D-7 lo redacta contra la tabla de comportamientos verificados y lo somete a revisión del usuario antes del `apply`. La spec exige verdad, no un texto fijo. |
| RN-WS-08 (la regla de negocio "escaneo encolado → Dashboard") queda contradicha por este change | Es una contradicción **deliberada y declarada**: el `REMOVED Requirement` de `scan-submission` documenta el motivo. Task explícita para anotar la enmienda en `knowledge-base/05_reglas_de_negocio.md`, para que la KB no quede mintiendo. |
| Un refresh en la pantalla de espera pierde el aviso | D-5: trade-off aceptado y explicado. El canal real de entrega es el email, que no depende del navegador. |
| El plumbing de `onAccepted` toca tres archivos del camino crítico del escaneo (`useScanForm`, `ScanForm`, `ScanFormWidget`) | Todos los props nuevos son **opcionales**: sin ellos, el comportamiento previo (menos la navegación) se conserva. ~~`LandingPage` es la prueba viva de ese camino por defecto.~~ (`LandingPage` ya no existe, ver nota D-2; el camino por defecto ahora sólo se ejercita en tests unitarios de `ScanForm`/`ScanFormWidget` renderizados sueltos). Safety net obligatorio: correr `scan-form.test.tsx`, `use-scan-form.test.tsx` y `scan-form-widget.test.tsx` **antes** de tocar nada (`landing-page.test.tsx` ya no existe — su equivalente vivo es `app-hydration.test.tsx`). |
| `/about` crece a una página larga y penaliza el presupuesto de rendimiento de `landing-shell` | Contenido estático, sin imágenes, sin librerías nuevas, sin `lazy`. Si el bundle se resintiera, el `Route` admite `React.lazy` sin cambiar nada más. |
| Duplicación del catálogo de herramientas entre `features-section` y `about` | Deliberada (D-6), acotada a cuatro nombres, y con el lugar correcto para deduplicarla ya identificado (`entities/`) si algún día duele. |

## Migration Plan

No hay migración de datos, de esquema ni de configuración. El despliegue es un build del frontend.

- **Sin cambios de entorno**: `VITE_DASHBOARD_URL` sigue siendo obligatoria (la usa el `Navbar` y la salida secundaria de la pantalla de espera).
- **Sin coordinación con el backend ni con n8n**: ningún contrato cambia. Un frontend nuevo contra un Bridge viejo funciona igual.
- **Rollback**: revertir el commit. No queda estado persistido que limpiar (D-5).

## Open Questions

Ninguna bloquea el `apply`. Las dos primeras las decide el usuario en el checkpoint del propose; la tercera es deuda registrada.

1. **Copy de privacidad (D-7)** — ¿la redacción propuesta le sirve al usuario, o prefiere una versión más corta / más conservadora? No cambia specs ni tasks.
2. **Rótulo y posición del link (D-8)** — "Acerca de" entre "Inicio" y "Escanear". Si el usuario prefiere otro rótulo u otro orden, es una línea.
3. ~~`pages/LandingPage` es código huérfano del routing (D-2). No lo resuelve este change. Candidato natural: retirarlo dentro de CHANGE-27.~~ **RESUELTA (2026-08-31, antes del apply)**: `pages/LandingPage` ya fue retirado por un fix de deuda de tests aparte, y `openspec/specs/landing-bootstrap/spec.md` ya se actualizó para reflejarlo. `CHANGE-27` no necesita hacerse cargo de esto.
