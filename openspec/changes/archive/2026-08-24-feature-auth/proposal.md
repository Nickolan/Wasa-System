## Why

El frontend tiene, desde CHANGE-13/14/15, todas las piezas sueltas de autenticación: el `authStore` que sabe guardar una sesión, los schemas Zod que saben validar un formulario, y los primitivos de UI que saben dibujar un input con error y un botón con spinner. Lo que **no** tiene es nada que las conecte: hoy no existe ninguna forma de que un usuario se registre o inicie sesión desde la landing. El Bridge expone `POST /api/v1/auth/register` y `POST /api/v1/auth/login` desde CHANGE-05, funcionando y testeado, y del lado del cliente no hay un solo módulo que los llame.

Este change escribe esa conexión: las dos llamadas HTTP, los dos hooks que orquestan validación → request → sesión, y los dos formularios que el usuario efectivamente ve. Es el eslabón que convierte cuatro changes de infraestructura en una funcionalidad. Sin él, CHANGE-19 (los modales de auth) no tiene qué poner adentro del `Modal`, y todo el muro de autenticación (RN-WS-10) queda sin puerta.

## What Changes

- **Nueva slice `src/features/auth/`**, con dos sub-slices independientes (`login/` y `register/`), cada una con la tríada FSD `api/` + `model/` + `ui/`:
  - `login/api/loginApi.ts` — `POST {VITE_API_BASE_URL}/api/v1/auth/login` con `{ email, password }`; devuelve `TokenResponse` en 200, lanza un error tipado del cliente ante cualquier respuesta no exitosa (401 incluido).
  - `login/model/useLogin.ts` — `useForm` + `zodResolver(loginSchema)`; en submit llama a `loginApi`, y en éxito hace `authStore.login(token, email)` y luego invoca `onSuccess()`. Expone `isSubmitting` y `serverError`.
  - `login/ui/LoginForm.tsx` — campos email + password sobre `@shared/ui/Input`, botón "Ingresar" con `loading`, banner de error de servidor, y un link "¿No tenés cuenta? Registrate" que delega en una prop (`onSwitchToRegister`).
  - `register/api/registerApi.ts` — `POST .../auth/register` con `{ email, password }` (**sin** `confirmPassword`, que el Bridge rechazaría por `extra="forbid"`); 201 → `TokenResponse`; 409 → error tipado.
  - `register/model/useRegister.ts` — `useForm` + `zodResolver(registerSchema)`; mismo contrato de éxito que `useLogin`.
  - `register/ui/RegisterForm.tsx` — email + password + confirmPassword, botón "Registrarme", link "¿Ya tenés cuenta? Iniciá sesión".
- **Nuevo módulo compartido de la slice, `src/features/auth/lib/`**: un cliente HTTP mínimo para los dos endpoints públicos de auth y la traducción de la respuesta de error del Bridge (RFC 7807) a un error de cliente con `status` y mensaje ya resuelto en castellano. Las dos APIs y los dos hooks comparten esa única traducción en vez de repetir un mapa de `status → mensaje` cada una.
- **Mensajes de error de servidor fijados por el change** (criterios de aceptación de CHANGES.md, HU-06-02/HU-06-03): 401 → "Credenciales incorrectas."; 409 → "Este email ya está registrado."; cualquier otro fallo (500, 502, red caída, timeout) → un mensaje genérico único. El `detail` que emite el Bridge **no** se muestra al usuario (ver D-5 en `design.md`).
- **Se modifica `wasa-landing/tests/structure.test.ts`**: hoy afirma que `src/features/` contiene únicamente `.gitkeep`. Este change es precisamente el que puebla esa capa, así que esa aserción se reemplaza por el inventario real de la slice `auth` — el mismo movimiento que CHANGE-14 hizo con `src/entities/` y CHANGE-15 con `src/shared/ui/`. Se elimina `src/features/.gitkeep`.
- **Sin dependencias nuevas**: `axios`, `react-hook-form`, `@hookform/resolvers` y `zod` ya están instalados desde CHANGE-00b.
- **Sin cambios en el backend, en `entities/`, en `shared/` ni en el `authStore`**: este change es puro consumidor de los tres.

## Capabilities

### New Capabilities

- `auth-client-requests`: cómo el cliente le habla a los dos endpoints públicos de autenticación del Bridge — método, ruta, forma exacta del cuerpo enviado, qué constituye éxito, y cómo toda respuesta no exitosa (incluidas las que no traen cuerpo RFC 7807 y las que no llegan a tener respuesta) se convierte en un error de cliente uniforme con su código de estado preservado.
- `auth-form-flows`: el comportamiento observable de los formularios de registro e inicio de sesión — la validación local como puerta previa a la red, el estado de envío que impide un segundo submit, el establecimiento de la sesión en éxito, el aviso al contenedor de que puede cerrarse, y qué mensaje ve el usuario ante cada clase de fallo (campo inválido, credenciales rechazadas, email duplicado, fallo genérico).

### Modified Capabilities

Ninguna. `auth-form-contracts` (CHANGE-14), `auth-session-state` (CHANGE-13) y `shared-ui-kit` (CHANGE-15) se consumen tal como están; ninguno de sus requirements cambia. `landing-bootstrap` ya especifica la regla de fronteras FSD y su test automático: este change se somete a ella, no la altera.

## Impact

- **Código nuevo**: `wasa-landing/src/features/auth/**` (login y register: `api/`, `model/`, `ui/`, más `lib/` compartido de la slice) y sus tests en `wasa-landing/tests/`.
- **Código modificado**: `wasa-landing/tests/structure.test.ts` (inventario de `src/features/`); borrado de `wasa-landing/src/features/.gitkeep`.
- **Dependencias de changes**: requiere CHANGE-13, CHANGE-14 y CHANGE-15 (los tres archivados). Desbloquea CHANGE-19 (`landing-widgets`), que monta `LoginForm`/`RegisterForm` dentro de `Modal` y provee las props `onSuccess` / `onSwitch*`.
- **Frontera con CHANGE-18**: CHANGE-18 crea `src/shared/api/axiosInstance.ts` con el interceptor que adjunta `Authorization: Bearer` y desloguea ante un 401. Este change **no** usa esa instancia (todavía no existe) y **no debe** usarla cuando exista: los endpoints de auth son públicos, no llevan token, y su 401 significa "credenciales incorrectas", no "sesión expirada" — pasarlos por ese interceptor haría que un login fallido deslogueara al usuario. Ver D-2 en `design.md`.
- **Sin impacto en el backend**: no toca `fastapi_bridge/`, ni la base `db_fuzzing`, ni n8n, ni el `dashboard/` heredado. El contrato de los dos endpoints ya está congelado por CHANGE-05/CHANGE-07.
- **Sin sistema de diseño todavía**: las clases visuales propias de los formularios (layout, banner de error) son utilidades Tailwind planas, concentradas para que CHANGE-20 (`design-system`) las reemplace por tokens en un solo lugar.
- **Governance ALTO**: es la superficie por la que viajan credenciales en texto plano desde el navegador. Las decisiones con matiz de seguridad —qué se loguea (nada), qué del error del servidor se muestra, qué se envía en el cuerpo, y por qué el 401 de auth no se trata como "sesión expirada"— están explicitadas en `design.md` (D-2, D-5, D-6, D-9) para revisión antes de implementar.
