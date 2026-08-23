## Why

El scaffold del frontend (CHANGE-00b) dejó `wasa-landing/src/shared/ui/` y `src/shared/lib/` vacíos (solo `.gitkeep`). Los ocho changes de frontend que vienen después — formularios de login/registro (CHANGE-16), formulario de escaneo (CHANGE-18), modales de auth (CHANGE-19), authStore (CHANGE-13) — necesitan todos los mismos primitivos de UI: un botón con estado de carga, un input con label y mensaje de error, un checkbox, un spinner y un modal. Sin ellos, cada change reimplementaría su propia variante y el resultado sería un frontend visualmente inconsistente y con cinco copias de la misma lógica de accesibilidad.

Este change entrega esos primitivos **una sola vez, en la capa `shared/`**, antes de que cualquier feature los necesite: es el equivalente frontend de lo que `exceptions/handlers.py` fue para el backend — una decisión tomada una vez, heredada por todo lo que venga después.

## What Changes

- **Nuevos componentes en `src/shared/ui/`** (React 19 + Tailwind 4, sin conocimiento alguno del dominio WASA):
  - `Button.tsx` — variantes `primary` / `secondary`, estado `loading` que muestra el `Spinner` y deshabilita el botón.
  - `Input.tsx` — label asociado, mensaje de error, texto de ayuda (helper), borde rojo en error y verde en estado válido.
  - `Checkbox.tsx` — label embebido, estado de error.
  - `Spinner.tsx` — SVG animado con `animate-spin`, tamaño configurable.
  - `Modal.tsx` — backdrop, cierre con `Escape`, cierre por clic en el backdrop, `children` como slot opaco (el Modal **no** sabe nada de auth ni de scan).
- **Nuevo módulo `src/shared/lib/utils.ts`**:
  - `cn(...inputs)` — merge de clases Tailwind (clsx + tailwind-merge), para que `className` del consumidor pueda sobreescribir las clases por defecto de un componente sin pelearse con la especificidad.
  - `jwtIsExpired(token)` — lee el claim `exp` del JWT sin librería adicional y responde si la sesión ya venció. **No verifica la firma** (eso es autoridad exclusiva del Bridge); es un chequeo de conveniencia para que `authStore.hydrate()` (CHANGE-13) no restaure una sesión muerta.
- **Nuevas dependencias de runtime**: `clsx` y `tailwind-merge` (línea compatible con Tailwind CSS 4).
- **Suite de tests** en `wasa-landing/tests/`, un archivo por componente y uno por función de `utils.ts`, sobre el runner Vitest + Testing Library ya cableado por CHANGE-00b.
- Sin cambios de comportamiento en nada existente: ningún archivo previo se modifica salvo `package.json` (dos dependencias nuevas).

## Capabilities

### New Capabilities

- `shared-ui-kit`: los primitivos de presentación reutilizables del frontend (Button, Input, Checkbox, Spinner, Modal) — su contrato de props, sus estados visuales (carga, error, válido), su accesibilidad y la garantía de que permanecen agnósticos del dominio WASA.
- `shared-client-utils`: las utilidades puras de la capa `shared/lib` — el merge de clases Tailwind (`cn`) y la inspección de expiración de un JWT en el cliente (`jwtIsExpired`), incluida su política de fail-closed ante tokens malformados.

### Modified Capabilities

Ninguna. `landing-bootstrap` ya especifica la regla de fronteras FSD y el test que la verifica automáticamente; este change se somete a esa regla, no la cambia.

## Impact

- **Código nuevo**: `wasa-landing/src/shared/ui/{Button,Input,Checkbox,Spinner,Modal}.tsx`, `wasa-landing/src/shared/lib/utils.ts`, y sus tests en `wasa-landing/tests/`.
- **Código modificado**: `wasa-landing/package.json` (+ `clsx`, + `tailwind-merge`) y `package-lock.json`.
- **Dependencias de changes**: requiere CHANGE-00b (archivado). Desbloquea CHANGE-16 (feature-auth), CHANGE-18 (feature-scan-form) y CHANGE-19 (widgets), que consumen estos primitivos.
- **Solapamiento con CHANGE-13 (`zustand-auth-store`)**: ambos changes declaran `src/shared/lib/utils.ts` en su scope y corren en paralelo en el roadmap. Este change implementa las **dos** funciones (`cn` y `jwtIsExpired`), de modo que CHANGE-13 pase a ser consumidor y no coautor del archivo (ver D-2 en `design.md`).
- **Sin impacto en backend**: no toca `fastapi_bridge/`, ni la base `db_fuzzing`, ni n8n, ni el `dashboard/` heredado.
- **Sin sistema de diseño todavía**: las clases de cada variante son utilidades Tailwind planas, centralizadas en un único mapa por componente para que CHANGE-20 (`design-system`) las reemplace por tokens semánticos en un solo lugar.
