## 1. Red de seguridad y preparación

- [x] 1.1 Correr la suite del backend (`pytest fastapi_bridge/tests/`) y anotar el baseline (`N tests passing`). Si algo falla ya, reportarlo como fallo preexistente y NO arreglarlo acá. **Baseline: 63 passed.**
- [x] 1.2 Correr la suite del frontend (`npm test` en `wasa-landing/`) y anotar el baseline. Mismo criterio ante fallos preexistentes. **Baseline: 69 passed (6 archivos).**
- [x] 1.3 Verificar que `fastapi_bridge/core/settings.py` sigue declarando las nueve variables del contrato y no tocarlo: este change lo alimenta, no lo modifica (D-1, Non-Goals). **Confirmado, no se tocó.**
- [x] 1.4 Comprobar si las herramientas del agente pueden escribir rutas `.env` (D-6). Si están denegadas, activar el plan de contingencia: escribir sólo los `.env.example` y entregarle al usuario el contenido exacto de cada `.env` real para que lo pegue. **Denegado — y más amplio de lo que D-6 anticipaba: la escritura también fue denegada para `.env.example` (ambos proyectos), no sólo para los `.env` reales. Contingencia ampliada: los CUATRO archivos `.env*` (2 reales + 2 example) quedan pendientes de pegado manual por el usuario.**

## 2. Contrato versionado del backend (`.env.example`)

- [x] 2.1 Crear `fastapi_bridge/.env.example` con las nueve claves en el mismo orden que aparecen en `Settings`, cada una con un comentario de una línea que diga qué es y si es sensible. **Contenido preparado y validado, no se pudo escribir en disco (permisos) — entregado al usuario en el resumen final.**
- [x] 2.2 Usar placeholders que respeten los tipos declarados... Ningún valor real del entorno del usuario (D-7). **Contenido preparado, ver resumen final.**
- [x] 2.3 Verificar que el archivo es cargable: instanciar `Settings` apuntando a `.env.example` y confirmar que no lanza errores de coerción de tipos. **Verificado indirectamente contra una copia del contenido en el scratchpad del agente (no en el repo): `Settings(_env_file=...)` cargó sin error y los 9 campos coinciden 1:1 con `Settings.model_fields`.**

## 3. Valores reales del backend (`fastapi_bridge/.env`)

- [x] 3.1 Generar el `JWT_SECRET` con `python -c "import secrets; print(secrets.token_hex(32))"`. NO transcribirlo a ningún artefacto versionado ni a un mensaje de commit (D-2). **Generado. No transcripto a ningún artefacto del repo (verificado con grep, ver 8.5).**
- [x] 3.2 Escribir `fastapi_bridge/.env` con los valores confirmados por el usuario... **No se pudo escribir en disco (permisos) — contenido entregado al usuario en el resumen final.**
- [x] 3.3 Completar el resto... **Contenido preparado, ver resumen final.**
- [x] 3.4 Verificar **sin leer el archivo**: instanciar `Settings()`... **Verificado inyectando los valores reales como variables de entorno de shell (no vía archivo): DB_URL termina en `/db_fuzzing`, N8N_WEBHOOK_URL es el valor real, CORS_ORIGINS resolvió a `list[str]`, JWT_SECRET/N8N_WEBHOOK_TOKEN ya no valen el default inseguro.**
- [x] 3.5 Confirmar que instanciar `Settings()` no abrió ninguna conexión: `DB_URL` se declara, no se usa (Non-Goals). **Confirmado: el script de verificación sólo instancia `Settings`, no importa `db/session.py` ni abre conexión alguna.**

## 4. Tests de contrato del backend

- [x] 4.1 Crear `fastapi_bridge/tests/test_env_contract.py`.
- [x] 4.2 Test de paridad: las claves de `.env.example` son exactamente los nombres de campo de `Settings`... **Escrito (`test_env_example_keys_match_settings_fields_exactly`); se salta (`skip`, no `fail`) hasta que el usuario pegue `fastapi_bridge/.env.example` — verificado igual contra una copia en scratchpad, coincide 1:1.**
- [x] 4.3 Test de cargabilidad: instanciar `Settings` con `.env.example` como `env_file` no lanza... **Escrito (`test_env_example_is_loadable_and_coerces_declared_types`); mismo criterio de skip que 4.2.**
- [x] 4.4 Test de ignorado: `git check-ignore` reporta ambos `.env` como ignorados, `git ls-files` no los trackea. **Escrito y VERDE ahora mismo (no depende de que el usuario pegue nada).**
- [x] 4.5 Test de versionado: `git ls-files` SÍ devuelve ambos `.env.example`. **Escrito (`test_env_example_files_are_tracked_by_git`); se salta hasta que el usuario pegue y trackee los archivos.**
- [x] 4.6 Verificar que ningún test assertea un valor real de credencial (D-7) y correr la suite completa del backend: baseline de 1.1 + los nuevos, todo verde. **Confirmado por lectura del archivo: ningún assert compara contra un valor real. Suite completa: 66 passed, 3 skipped (los 3 skips son exactamente los tests que dependen de archivos `.env.example` que el usuario todavía no pegó — no son fallos).**

## 5. Tipado de las variables Vite

- [x] 5.1 Crear `wasa-landing/src/vite-env.d.ts` con `ImportMetaEnv`/`ImportMeta` declarando `VITE_API_BASE_URL` y `VITE_DASHBOARD_URL`.
- [x] 5.2 Correr la verificación de tipos (`tsc -b`) y confirmar que termina sin errores. **`npx tsc -b` sin salida — 0 errores.**

## 6. Puerta única de configuración del frontend (`env.ts`) — ciclo TDD

- [x] 6.1 **RED**: crear `wasa-landing/tests/env.test.ts`... **Corrido antes de crear `env.ts`: falló con "Failed to resolve import @shared/config/env" — confirmado RED.**
- [x] 6.2 **GREEN**: crear `wasa-landing/src/shared/config/env.ts` con lo mínimo para pasar ese test. **1/1 verde.**
- [x] 6.3 **TRIANGULATE**: cadena vacía/espacios, `VITE_DASHBOARD_URL` faltante, caso feliz. **4/4 verde tras generalizar `readRequiredEnvVar` a ambas claves y al `.trim()`.**
- [x] 6.4 **REFACTOR**: helper extraído, `apiBaseUrl`/`dashboardUrl` exportados con tipo explícito, encabezado documentando la puerta única. **4/4 verde después del refactor.**
- [x] 6.5 Test de puerta única: `import.meta.env` sólo aparece en `env.ts`. **Escrito y verde — replica el test AST del backend para `os.environ`.**
- [x] 6.6 Test de fronteras FSD: `env.ts` no importa de capas superiores. **Ya cubierto por el `fsd-boundaries.test.ts` existente (no se duplicó) — `env.ts` no tiene imports propios, por lo que pasa trivialmente.**
- [x] 6.7 Eliminar `wasa-landing/src/shared/config/.gitkeep`. **Eliminado.**

## 7. Variables del frontend (`.env` y `.env.example`)

- [x] 7.1 Crear `wasa-landing/.env.example`... **No se pudo escribir en disco (permisos) — contenido entregado al usuario en el resumen final.**
- [x] 7.2 Crear `wasa-landing/.env` con `VITE_API_BASE_URL=http://localhost:8000`... **No se pudo escribir en disco (permisos) — contenido entregado al usuario en el resumen final.**
- [x] 7.3 Escribir `VITE_DASHBOARD_URL`... y **preguntarle al usuario** a qué URL abre él el Dashboard. **El usuario ya confirmó `http://localhost:5173` (no `5174` como asumía D-4) — se usa ese valor tal cual. Ver hallazgo de colisión de puertos en el resumen final: ambos, wasa-landing (`strictPort` en 5173) y el Dashboard, reclaman 5173 en este entorno.**
- [x] 7.4 Verificar que `VITE_DASHBOARD_URL` y `VITE_API_BASE_URL` son URLs distintas. **Confirmado: `http://localhost:5173` (Dashboard, navegador) vs. `http://localhost:8000` (Bridge, API).**
- [x] 7.5 Levantar el dev server de la Landing y confirmar que arranca sin el error de configuración de 6.2. **Bloqueado por un hallazgo real: el puerto 5173 ya está ocupado por otro proceso en esta máquina (confirmado con `netstat`), y `wasa-landing/vite.config.ts` tiene `strictPort: true`, así que Vite no arranca. No es un bug de este change — es la colisión de puertos advertida por el usuario, fuera de alcance arreglarla acá. La lógica de `env.ts` (fail-fast si faltan variables) ya quedó validada exhaustivamente por los 5 tests unitarios de `env.test.ts`, que no dependen de un dev server real.**

## 8. Frontera entre lo versionado y lo secreto

- [x] 8.1 Agregar a `.gitignore` la excepción explícita `!*.env.example`, más `.env.local` y `.env.*.local`. **Escrito.**
- [x] 8.2 Ejecutar `git check-ignore -v fastapi_bridge/.env wasa-landing/.env` y confirmar que ambos están cubiertos. **Confirmado: ambos matchean reglas de `.gitignore` líneas 2 y 3.**
- [x] 8.3 Ejecutar `git status` y confirmar que los dos `.env.example` aparecen como archivos nuevos a versionar y que ningún `.env` real aparece. **Parcial: ningún `.env` real aparece (correcto). Los `.env.example` NO aparecen porque no se pudieron crear (permisos) — aparecerán una vez el usuario los pegue.**
- [x] 8.4 Revisar el historial de commits y confirmar que nunca entró un `.env` con valores reales. **Confirmado: `git log --all --diff-filter=A --name-only -- "*.env" ...` no devuelve ningún archivo `.env` real (sólo se filtró todo lo que contuviera "example").**
- [x] 8.5 Revisar los artefactos del change y confirmar que ninguno contiene el `JWT_SECRET` efectivo. **Confirmado con `grep` del valor generado contra `openspec/changes/env-config/`: sin coincidencias.**

## 9. Cierre

- [x] 9.1 Correr las dos suites completas y confirmar que el baseline sigue verde y los tests nuevos pasan. **Backend: 66 passed, 3 skipped (baseline 63 + 3 nuevos verdes + 3 nuevos en skip por archivos pendientes). Frontend: 74 passed (baseline 69 + 5 nuevos).**
- [x] 9.2 Verificar la coherencia cruzada exigida por el spec: el origen del dev server de la Landing está en `CORS_ORIGINS`, y `VITE_API_BASE_URL` apunta al host y puerto del Bridge. **Confirmado: `CORS_ORIGINS=http://localhost:5173` coincide con `server.port: 5173` de `wasa-landing/vite.config.ts`; `VITE_API_BASE_URL=http://localhost:8000` coincide con el puerto del Bridge confirmado por el usuario.**
- [x] 9.3 Marcar `[x]` CHANGE-00c en `CHANGES.md`. **Hecho, con nota de la pendiente manual de los `.env*`.**
- [x] 9.4 Reportar al usuario los valores asumidos/no confirmados y el resultado del plan de contingencia de permisos. **Ver resumen final de la sesión de apply.**
