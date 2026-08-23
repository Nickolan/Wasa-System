## Why

Los formularios de registro e inicio de sesión (HU-06-02, HU-06-03) todavía no tienen contrato: no existe ningún tipo que describa qué campos manda el navegador, ni ninguna validación que corra antes de llamar al Bridge. Sin ese contrato, cada formulario que se escriba en CHANGE-16/17 inventará su propia forma y su propia política de contraseña, y la única validación real será la del backend — un 422 remoto en vez de un mensaje bajo el campo.

El backend ya fijó su lado del contrato en CHANGE-02 (`fastapi_bridge/schemas/auth_schemas.py`): mínimo 8 caracteres (RN-WS-15), **techo de 72 bytes UTF-8** en la contraseña (D-2 de aquel change, impuesto por bcrypt) y `extra="forbid"`. Ese techo no está en la KB, así que si el frontend no lo replica, el usuario escribe una contraseña larga que el formulario acepta y el Bridge rechaza con un 422 opaco (R-2 de CHANGE-02). Este change escribe el lado del cliente de ese contrato, con paridad exacta y verificada por tests.

## What Changes

- Se crea la slice `entities/user` (hoy `src/entities/` está vacío, solo con `.gitkeep`), con su modelo de dominio de autenticación:
  - **Tipos** (`model/types.ts`): `UserRegister` (email, password, confirmPassword — modelo del **formulario**), `UserLogin` (email, password), `TokenResponse` (access_token, token_type, expires_in) y `AuthApiError` (type, title, status, detail, instance), este último espejo de `ErrorDetail` del Bridge.
  - **Política de contraseña compartida** (`model/passwordRules.ts`): las constantes de paridad con el backend (mínimo 8 caracteres, techo de 72 **bytes UTF-8**) y la medición por bytes, en un único lugar que consumen ambos schemas — igual que el alias `PasswordWithByteCeiling` del backend.
  - **`model/loginSchema.ts`** (Zod): email válido + contraseña no vacía con el techo de 72 bytes. Deliberadamente **no** reasserta el mínimo de 8 (paridad con D-3 del backend: no filtrar la política vigente ni bloquear a usuarios previos).
  - **`model/registerSchema.ts`** (Zod): email válido, contraseña de 8 caracteres como mínimo y 72 bytes como máximo, confirmación no vacía, y un `superRefine` que exige `password === confirmPassword` reportando el error **sobre el campo `confirmPassword`**.
  - **API pública de la slice** (`index.ts`): lo que los formularios de CHANGE-16/17 pueden importar (`@entities/user`), sin rutas profundas.
- Se declara explícitamente el tipo del **cuerpo que viaja al Bridge** en el registro (`UserRegister` sin `confirmPassword`), para que ningún cliente HTTP posterior mande el campo de confirmación a un endpoint con `extra="forbid"`.
- Se actualiza `tests/structure.test.ts`, que hoy afirma que `src/entities` contiene únicamente `.gitkeep` — esa afirmación caduca con este change y pasa a describir la slice `user`.
- Sin cambios de UI, sin llamadas de red, sin tocar el store de sesión (CHANGE-13) ni el backend.

## Capabilities

### New Capabilities
- `auth-form-contracts`: la forma y las reglas de validación de los datos de autenticación en el cliente — qué campos tiene cada formulario, qué contraseña se acepta antes de llamar al Bridge, cómo se confirma la contraseña, qué forma tiene la respuesta de token y la de error de la API, y la garantía de paridad con los contratos Pydantic del Bridge (`auth-contracts`, `error-contract`).

### Modified Capabilities
<!-- Ninguna. Este change no altera requisitos existentes: `auth-contracts` y
     `error-contract` son del Bridge y quedan intactos (esta capability los
     refleja, no los modifica), y `auth-session-state` (CHANGE-13) sigue igual:
     el store no consume estos schemas. -->

## Impact

- **Código nuevo**: `wasa-landing/src/entities/user/` (`model/types.ts`, `model/passwordRules.ts`, `model/loginSchema.ts`, `model/registerSchema.ts`, `index.ts`).
- **Código modificado**: `wasa-landing/tests/structure.test.ts` (la aserción "`src/entities` contiene solo `.gitkeep`"), y `src/entities/.gitkeep` se elimina al dejar de estar vacía la capa.
- **Tests nuevos**: `wasa-landing/tests/auth-schemas.test.ts` (Vitest), incluido un test de paridad que lee `fastapi_bridge/schemas/auth_schemas.py` y verifica que los números 8 y 72 del frontend siguen siendo los del backend.
- **Dependencias**: ninguna nueva — `zod@3.25.76` ya está instalado (CHANGE-00b/13).
- **Consumidores aguas abajo**: CHANGE-16 (`register-form`), CHANGE-17 (`login-form`) y CHANGE-18 (`auth-api-client`) importan de `@entities/user`. Este contrato es el que fija la forma de sus payloads.
- **Fuera de alcance**: componentes de formulario, `react-hook-form`, cliente HTTP, manejo de 401/409, y validación en runtime de la respuesta del Bridge (`TokenResponse` es un tipo, no un schema de parseo).
