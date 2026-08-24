## Why

El frontend ya tiene **todas las piezas y ningún producto**. `entities/user` guarda la sesión (CHANGE-13/16), `features/auth` sabe registrar e iniciar sesión (CHANGE-16), `features/scan-form` sabe disparar un escaneo (CHANGE-18) y `shared/ui` tiene los cinco primitivos incluido `Modal` (CHANGE-15) — pero `src/widgets/` contiene únicamente un `.gitkeep` y `pages/LandingPage/index.tsx` sigue siendo el placeholder de CHANGE-00b con un `<ScanForm />` colgado suelto "para probarlo". Hoy la Landing **muestra el formulario de escaneo a cualquier visitante anónimo**, que es exactamente lo que RN-WS-10 prohíbe, y no existe forma de llegar a los modales de login/registro: `LoginForm` y `RegisterForm` están escritos, exportados y sin un solo consumidor.

Este change es el que convierte el conjunto de piezas en la Landing: el contenido informativo público (HU-01-01..04), el muro de autenticación que oculta el formulario a los anónimos (RN-WS-10, HU-06-01, HU-02-01), los modales que hospedan los formularios ya existentes (HU-06-02/03) y el cierre de sesión (HU-06-05).

## What Changes

- **Capa `widgets/` poblada** (hoy vacía) con seis slices, cada una con su API pública (`index.ts`):
  - `widgets/hero`: título, tagline, ilustración e **un** CTA "Comenzar" cuyo destino depende de la sesión — con sesión hace scroll al ancla del formulario, sin sesión pide abrir el modal de inicio de sesión (HU-01-01).
  - `widgets/features-section`: cuatro tarjetas, una por herramienta que ejecuta el orquestador (ZAP, Nuclei, ffuf, SQLMap), con nombre, ícono y qué detecta cada una (HU-01-02).
  - `widgets/how-it-works`: cuatro pasos del flujo, empezando por "Crear cuenta" y sin mencionar jamás n8n, Redis ni el worker (HU-01-03).
  - `widgets/auth-modal`: `LoginModal` y `RegisterModal` — **cáscaras** sobre el `Modal` de `shared/ui` que hospedan los `LoginForm`/`RegisterForm` ya existentes sin modificarlos, más la máquina de estado que garantiza que haya como máximo uno abierto y que el enlace de cada formulario alterne al otro (HU-06-02, HU-06-03). Al autenticarse con éxito el diálogo se cierra y la vista se desplaza hasta la sección del formulario recién revelado, venga el disparador del muro o del CTA de la presentación (`design.md` D-3).
  - `widgets/scan-form`: la puerta. Sin sesión renderiza el muro con "Iniciar Sesión"/"Crear Cuenta" y **ningún campo del formulario en el documento**; con sesión renderiza el `<ScanForm />` de CHANGE-18 más el botón "Cerrar sesión" (RN-WS-10, HU-06-01, HU-02-01, HU-06-05).
  - `widgets/footer`: pie con la identidad del proyecto y su marco académico.
- **`pages/LandingPage` deja de ser un placeholder**: pasa a componer los seis widgets en el orden de la KB y a ser el **único** dueño del estado de "qué modal está abierto", que reparte a Hero y a ScanFormWidget por callback. Desaparece el `<ScanForm />` suelto que hoy renderiza para cualquiera.
- **El aviso ético queda visible también para el visitante anónimo**, no sólo detrás del muro como sugiere la letra del roadmap: HU-01-04 y la matriz RBAC de `03_actores_y_roles.md` lo listan como contenido informativo de lectura para el rol Anónimo y exigen que "no pueda ocultarse". Ver `design.md` D-8.
- **Ancla `#scan-form` estable**: el identificador vive en la sección exterior del `ScanFormWidget` y existe en los dos estados de sesión, de modo que el destino del CTA nunca desaparece a mitad de la vida de la página.
- **Sin cambios en `features/`, en `entities/` ni en `shared/`**: los formularios, el store de sesión, el cliente HTTP y los cinco primitivos se consumen tal como están. En particular **no se toca `shared/ui/Modal`**, cuyo contrato está congelado por `shared-ui-kit` y sus diez escenarios.
- **Sin dependencias nuevas** y **sin backend tocado**: no hay router, no hay estado global adicional, no hay librería de modales ni de animación.
- **Tests de estructura actualizados, no relajados**: `tests/structure.test.ts` afirma hoy que `src/features/` contiene exactamente dos slices y que cada `.gitkeep` está anotado; pasa a describir también el inventario de `src/widgets/` y la desaparición de su `.gitkeep` (mismo criterio que D-13 de CHANGE-18).
- **Fuera de alcance**: el diseño visual definitivo, los tokens semánticos y la paleta (CHANGE-20 — acá las clases Tailwind son planas y están concentradas en constantes por componente, igual que en CHANGE-16/18); el atrapado de foco dentro del modal (ver `design.md` R-1); cualquier cambio a los formularios de auth o al formulario de escaneo; la persistencia y expiración del token; el header/navbar (no existe en este alcance).

## Capabilities

### New Capabilities

- `landing-composition`: qué secciones componen la Landing pública, en qué orden, qué información expone cada una a cualquier visitante sin sesión (herramientas, pasos del flujo, aviso ético, pie), qué destino tiene el llamado a la acción principal según haya o no sesión, y qué detalles de la infraestructura interna NO pueden aparecer en pantalla.
- `auth-wall`: la puerta al formulario de escaneo — qué ve un visitante sin sesión en lugar del formulario, la garantía de que ningún campo del formulario existe en el documento mientras no haya sesión, qué aparece al haberla, y qué pasa al cerrar sesión.
- `auth-modal-flow`: la orquestación de los dos modales de autenticación — cuántos pueden estar abiertos a la vez, cómo se alternan entre sí, qué los cierra (éxito, `Escape`, backdrop, botón), y en qué estado queda un formulario que se reabre.

### Modified Capabilities

- `landing-bootstrap`: la Landing deja de ser un placeholder. El escenario que hoy afirma que la aplicación "renderiza el placeholder de la Landing" pasa a exigir la composición real de secciones, y la capa `widgets/` deja de estar vacía y pasa a tener inventario declarado.

## Impact

- **Código nuevo** (todo bajo `wasa-landing/src/widgets/`):
  - `hero/ui/HeroWidget.tsx`, `hero/model/useHeroCta.ts`, `hero/index.ts`
  - `features-section/ui/FeaturesWidget.tsx`, `features-section/model/tools.ts`, `features-section/index.ts`
  - `how-it-works/ui/HowItWorksWidget.tsx`, `how-it-works/model/steps.ts`, `how-it-works/index.ts`
  - `auth-modal/ui/LoginModal.tsx`, `auth-modal/ui/RegisterModal.tsx`, `auth-modal/model/useAuthModal.ts`, `auth-modal/index.ts`
  - `scan-form/ui/ScanFormWidget.tsx`, `scan-form/model/anchor.ts`, `scan-form/index.ts`
  - `footer/ui/FooterWidget.tsx`, `footer/index.ts`
- **Código modificado**:
  - `wasa-landing/src/pages/LandingPage/index.tsx` (reescrito: composición + dueño del estado de modales)
  - `wasa-landing/src/widgets/.gitkeep` (se borra: la capa dejó de estar vacía)
  - `wasa-landing/tests/structure.test.ts` (inventario de `src/widgets/`)
  - `wasa-landing/tests/landing-page.test.tsx` (hoy afirma el placeholder; pasa a afirmar la composición)
- **Tests nuevos**: `tests/hero-widget.test.tsx`, `tests/features-widget.test.tsx`, `tests/how-it-works-widget.test.tsx`, `tests/auth-modal.test.tsx`, `tests/use-auth-modal.test.tsx`, `tests/scan-form-widget.test.tsx`, `tests/footer-widget.test.tsx`, `tests/landing-responsive.test.ts` (guard de fuente sobre anchos fijos).
- **Consumidores aguas arriba**: ninguno — `widgets/` es la capa más alta que este change toca por debajo de `pages/`.
- **Dependencias**: ninguna nueva.
- **Superficie de seguridad tocada** (governance MEDIO): este change es el que **materializa RN-WS-10** en el frontend. El control es de presentación —el formulario no se renderiza sin sesión— y NO sustituye al control real, que es el `401` del Bridge sobre `POST /api/v1/scan/start` (`request-authentication`). Ocultar el formulario evita que un anónimo lo use; no evita que alguien emita la petición a mano, y no pretende hacerlo.
- **Limitación conocida**: `shared/ui/Modal` no atrapa el foco ni lo devuelve al disparador al cerrarse. Este change lo reutiliza tal cual y no cierra esa brecha de accesibilidad; queda registrada como riesgo en `design.md` R-1.
- **Deuda pre-existente que este change NO arregla**: los escenarios del requisito "Cada pieza de dominio aparece únicamente en el change que la implementa" de `landing-bootstrap` quedaron desactualizados desde CHANGE-15/16/18 (siguen afirmando que no existen los átomos de `shared/ui`, que el `authStore` vive en `app/stores/` y que `shared/api/` está vacío). No se tocan acá: corregirlos es una sincronización de spec que excede este change y merece decidirse por separado.
