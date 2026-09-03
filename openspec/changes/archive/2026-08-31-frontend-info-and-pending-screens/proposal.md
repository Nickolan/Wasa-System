## Why

Hoy, cuando el Bridge acepta un escaneo (`202`), la Landing muestra una confirmación durante 2 segundos y acto seguido tira al navegador fuera de la aplicación: `useScanForm.ts` asigna `window.location.href = dashboardUrl` en un `useEffect` (RN-WS-08, HU-05-01). Ese diseño se decidió cuando el Dashboard era el único lugar donde el usuario podía enterarse de algo, y hoy ya no describe el sistema real por dos motivos:

1. **El escaneo tarda ~10 minutos y el reporte llega por email.** CHANGE-23 (archivado) hizo que el email del usuario autenticado viaje hasta n8n y que el nodo `Send email` le mande el reporte a su propia casilla. El usuario ya no necesita quedarse mirando el Dashboard — pero la interfaz nunca se lo dice. Lo expulsa a un Dashboard donde, en los primeros minutos, no hay nada que ver, y donde ningún texto explica cuánto falta ni que el reporte va a llegarle solo.
2. **La redirección es una expulsión, no una navegación.** `dashboardUrl` apunta a una aplicación standalone distinta: el usuario pierde el contexto de la sesión que acaba de usar, y para volver a la Landing tiene que navegar a mano. La confirmación de 2 segundos existe justamente para amortiguar un cambio de pantalla que el usuario no pidió.

En paralelo, la Landing no tiene ningún lugar donde alguien —evaluador o visitante anónimo— pueda leer qué es WASA, qué herramientas corre, cómo es el flujo completo de un escaneo y qué pasa con los datos que entrega. La `HomePage` roza el tema en `FeaturesWidget` (cuatro tarjetas de una línea) y `HowItWorksWidget` (cuatro pasos), pero ambos son deliberadamente breves: son ganchos de conversión, no documentación. El objetivo del Usuario Anónimo en la KB —"entender qué es WASA y qué detecta antes de registrarse" (`01_vision_y_objetivos.md`)— hoy se cumple a medias, y la pregunta de privacidad ("¿qué hacen con la URL y el PHPSESSID que les doy?") no se responde en ninguna parte.

Los dos huecos son de la misma naturaleza —**información que el sistema ya tiene y la interfaz no comunica**— y se resuelven en la misma capa (`wasa-landing`, frontend puro), por eso van en un solo change.

## What Changes

### 1. Pantalla de espera post-escaneo (reemplaza la redirección)

- **Se elimina la redirección al Dashboard.** El `useEffect` de `useScanForm.ts` que asigna `window.location.href = dashboardUrl` tras `SUCCESS_REDIRECT_DELAY_MS` desaparece, junto con la constante de retraso y el import de `dashboardUrl` en ese módulo. **BREAKING** a nivel de spec: invalida el requirement "Un escaneo encolado lleva al Dashboard" de `scan-submission` y los cuatro escenarios que lo verifican. No es breaking para ningún contrato HTTP: el envío, su cuerpo, sus códigos de estado y sus mensajes de error no se tocan.
- **En su lugar, una pantalla de espera persistente.** Aceptado el escaneo, el usuario deja de ver el formulario y pasa a ver una pantalla que no se va sola y le informa tres cosas: que el escaneo está corriendo, que va a tardar aproximadamente diez minutos, y que el reporte le va a llegar por email a la casilla con la que inició sesión. Es un cambio de estado dentro de la misma página (`/scan`), no una navegación.
- **La pantalla no deja al usuario sin salida**: ofrece al menos un camino de vuelta al resto de la aplicación. El detalle exacto de qué salidas ofrece es decisión de `design.md` (D-4).
- **`VITE_DASHBOARD_URL` sigue existiendo y sigue siendo obligatoria.** El link "Dashboard" del `Navbar` la sigue consumiendo; este change no la da de baja. Su retiro pertenece a CHANGE-26.

### 2. Página informativa "Acerca de WASA"

- **Página nueva** en la ruta `/about`, montada en `App.tsx` junto a `/` y `/scan`, con contenido sobre: qué es WASA y qué problema resuelve; qué herramientas ejecuta (OWASP ZAP, Nuclei, ffuf, SQLMap) y qué detecta cada una; cómo es el flujo de un escaneo de punta a punta —incluyendo que el reporte llega por email y cuánto tarda—; y qué pasa con los datos que el usuario entrega (URL objetivo, PHPSESSID, su email) y con los hallazgos.
- **Link nuevo en el `Navbar`**, en desktop y en mobile, con el mismo tratamiento de estado activo que ya reciben "Inicio" y "Escanear".
- La página es **pública**: no requiere sesión, igual que `/`.
- El contenido es **contenido de producto, no una promesa técnica nueva**: describe lo que el sistema ya hace hoy. La sección de privacidad se redacta contra lo que el código efectivamente hace, no contra una política aspiracional — la disyuntiva y el texto exacto quedan planteados en `design.md` (D-6, D-7) para revisión del usuario.

### 3. Lo que NO cambia

- El FastAPI Bridge, el workflow de n8n, PostgreSQL `db_fuzzing` y el envío de email de CHANGE-23: intactos. Este change es 100 % frontend.
- El contrato de `submitScan`, el schema Zod de escaneo, los mensajes de error por código de estado, el guard de doble submit y el muro de autenticación: intactos.
- `HomePage`, `HeroWidget`, `FeaturesWidget`, `HowItWorksWidget`, `FooterWidget` y los modales de autenticación: no se reabren. La página informativa **no** reemplaza a `HowItWorksWidget`; lo extiende en profundidad.
- El Dashboard standalone (`dashboard/`) sigue en pie y accesible desde el `Navbar`.

## Capabilities

### New Capabilities

- `scan-pending-screen`: qué ve el usuario después de que el Bridge acepta su escaneo — el estado en curso, la expectativa temporal, el aviso de que el reporte llega por email a su casilla, la persistencia de esa pantalla (no se disuelve sola ni navega fuera), su accesibilidad como región de estado y la salida que le ofrece al usuario.
- `about-page`: la página pública de información del proyecto — qué contenido tiene que cubrir obligatoriamente (propósito, herramientas, flujo end-to-end, tratamiento de los datos), que es alcanzable por una ruta propia y desde la barra de navegación, y que es legible sin sesión.

### Modified Capabilities

- `scan-submission`: el requirement "Un escaneo encolado lleva al Dashboard" se reemplaza — la aceptación ya no navega a ninguna parte; entrega el control a la pantalla de espera de `scan-pending-screen`. El requirement "Durante el envío el formulario está en curso y no admite un segundo disparo" se ajusta en su tramo final: el formulario sigue sin admitir un segundo disparo tras la aceptación, pero ya no por "el navegador está por irse al Dashboard" — ahora porque el formulario deja de estar en pantalla.

## Impact

**Código afectado**

| Archivo | Qué pasa |
|---|---|
| `wasa-landing/src/features/scan-form/model/useScanForm.ts` | Se quita el `useEffect` de redirección, `SUCCESS_REDIRECT_DELAY_MS` y el import de `dashboardUrl`. El resto del hook (validación, envío, errores, guards) no se toca. |
| `wasa-landing/src/features/scan-form/ui/ScanForm.tsx` | El mensaje de éxito inline deja de ser lo que se muestra tras la aceptación; quién renderiza la pantalla de espera y dónde vive es decisión de `design.md` (D-1, D-2). |
| `wasa-landing/src/pages/ScanPage/index.tsx` | Alberga los dos estados de la página (formulario / espera), según la decisión D-1. |
| `wasa-landing/src/pages/AboutPage/index.tsx` | Nuevo. |
| `wasa-landing/src/widgets/` | Widget(s) nuevo(s) para la pantalla de espera y para el contenido informativo (D-1, D-5). |
| `wasa-landing/src/app/App.tsx` | Ruta `/about` nueva. Única línea que cambia. |
| `wasa-landing/src/widgets/navbar/ui/Navbar.tsx` | Entrada nueva en `NAV_LINKS`. |
| `wasa-landing/tests/use-scan-form.test.tsx` | El bloque "aceptación y redirección al Dashboard (8.1–8.6)" —con su sustitución de `window.location`— se reescribe: los escenarios de "ningún rechazo redirige" se reformulan como "ningún rechazo entra en estado de espera". |
| `wasa-landing/tests/scan-form.test.tsx` | Las aserciones sobre `SCAN_SUCCESS_MESSAGE` y sobre `window.location.href` se actualizan al nuevo estado post-aceptación. |
| `wasa-landing/tests/` | Tests nuevos para la pantalla de espera, la página informativa, la ruta y el link del `Navbar`. |

**Contratos y configuración**

- Sin cambios de API, de schemas Zod/Pydantic ni de variables de entorno. `VITE_DASHBOARD_URL` se conserva (la sigue usando el `Navbar`).
- Sin dependencias nuevas de runtime: `react-router-dom` y Tailwind ya están en el proyecto.

**Sistemas**

- Ninguno fuera de `wasa-landing`. No se toca el Bridge, ni n8n, ni la base de datos, ni el Dashboard standalone.

**Aguas abajo**

- **CHANGE-26 (`dashboard-frontend-migration`)** monta `/dashboard` dentro de esta misma aplicación. Cuando exista, la salida de la pantalla de espera podrá apuntar ahí sin volver a discutir el flujo: este change deja el punto de salida en un solo lugar, justamente para que ese cambio sea de una línea.
- **CHANGE-27 (`unified-design-system`)** armoniza visualmente todas las pantallas. Este change usa las clases Tailwind ya vigentes en los widgets existentes; no inventa una paleta nueva que después haya que deshacer.

**Riesgos**

- Bajo. Governance BAJO: frontend puro, sin auth, sin datos sensibles nuevos, sin superficie de red nueva. El riesgo mayor es de **copy**: el texto de la sección de privacidad de `/about` es una afirmación pública sobre el tratamiento de datos del usuario y tiene que ser verdadera respecto del código — por eso su redacción se surface como decisión explícita (D-7) en lugar de resolverse en el `apply`.
