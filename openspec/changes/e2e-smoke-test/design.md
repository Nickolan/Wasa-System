## Context

CHANGE-22 es el último del roadmap. Los 25 changes previos dejaron **547 tests de frontend** y **34 archivos de tests de backend**, todos con dobles: `httpx.MockTransport` en lugar de n8n, SQLite `aiosqlite` en memoria en lugar de `db_fuzzing`, jsdom en lugar de un navegador. Es una red de seguridad excelente para regresiones de unidad y absolutamente ciega a los defectos de integración: un `N8N_WEBHOOK_URL` mal escrito, un CORS que no deja pasar al origen real, un `DATABASE_URL` apuntando a la base equivocada, o un JWT que el frontend guarda con una clave que el interceptor no lee, pasan los 581 tests en verde y rompen el producto.

Este change construye la única prueba que ninguna de esas puede dar: el recorrido real, sobre infraestructura viva, con el navegador de verdad.

**Restricciones que condicionan todo el diseño:**

1. **`db_fuzzing` es compartida.** Las tablas `scans` y `vulnerabilities` pertenecen al sistema WASA preexistente de la tesis. La regla dura del proyecto prohíbe que el Bridge escriba o migre sobre ellas. La validación las lee; nunca las toca.
2. **El escaneo es real.** Un `202` dispara ZAP + Nuclei + ffuf + SQLMap contra un objetivo vivo. No es un efecto simulable ni gratuito, y tiene una dimensión ética que el propio producto le exige a sus usuarios vía checkbox. En esta validación el objetivo es la aplicación vulnerable que el operador corre en su propia máquina (`http://localhost:8081/`), de modo que el efecto es real pero enteramente contenido en su host (D-7).
3. **El rate limit es in-memory y por proceso.** `slowapi` con `key_func=get_remote_address` y storage por defecto: el contador vive en el proceso `uvicorn` y se resetea al reiniciarlo. No hay Redis detrás, no hay endpoint de reset.
4. **`pytest.ini` tiene `testpaths = fastapi_bridge/tests`.** Cualquier archivo nuevo bajo ese árbol se colecta por defecto. Un test E2E ingenuo ahí adentro rompería la corrida habitual de todos.
5. **Presupuesto: ~2 horas, governance MEDIO.** No hay margen para montar Playwright, un docker-compose de CI ni un harness de navegador desde cero.

**Estado de la infraestructura (confirmado por el usuario, 2026-08-24):** PostgreSQL `db_fuzzing`, n8n con el Webhook Trigger del CHANGE-21 **activo**, el `.env` real del Bridge y la aplicación vulnerable objetivo en `http://localhost:8081/` están **todos levantados y alcanzables ahora**. El change se diseña para correr de verdad, no para entregar una corrida llena de skips: la guarda de opt-in y los skips por dependencia ausente (D-2) se conservan como higiene para quien corra este suite más adelante en otra máquina, no porque haya dudas sobre este entorno. Esto cierra la pregunta abierta de prioridad Alta que arrastraba `10_preguntas_abiertas.md`.

## Goals / Non-Goals

**Goals:**

- Ejercitar el recorrido `registro → login → escaneo` completo contra Bridge + PostgreSQL + n8n vivos, y firmar los 18 criterios de aceptación del CHANGE-22 con evidencia.
- Dejar el suite E2E **repetible y versionado**, no una sesión manual irrepetible: la próxima persona que quiera saber si el sistema está sano corre un comando y lee un checklist.
- **Aislamiento absoluto** respecto de la suite unitaria: `pytest` sin flags debe seguir corriendo exactamente lo que corría antes, sin red y sin base.
- Que la ausencia de infraestructura produzca *skip*, no rojo. Un rojo del E2E tiene que significar siempre "el producto está roto".
- Cobertura explícita 1:1: cada criterio del roadmap asignado a un test nombrado o a un paso numerado del runbook.

**Non-Goals:**

- **No** se corrige ningún defecto que el smoke test encuentre. Se documenta como hallazgo con severidad; corregirlo es un change aparte que decide el usuario.
- **No** se agrega infraestructura de CI. Este suite se corre a mano, deliberadamente, contra un entorno que alguien levantó.
- **No** se introduce Playwright, Selenium ni Cypress. La parte de navegador es un runbook manual asistido por DevTools.
- **No** se valida el Dashboard existente más allá de comprobar que la redirección ocurre. El Dashboard está fuera de alcance del proyecto (KB §03, §07 paso 11).
- **No** se verifica el resultado del escaneo (vulnerabilidades encontradas). El contrato del Bridge es *fire-and-forward*: termina en el `202`. Lo que ZAP encuentre es asunto del workflow, no de esta validación.

## Decisions

### D-1: División automatizado / manual por *costo de automatizar*, no por capa

**Decisión.** Se automatiza el recorrido **HTTP + persistencia** (pytest, 10 criterios) y se deja en runbook manual el recorrido **navegador + UI de n8n** (8 criterios).

| Criterio del roadmap | Dónde vive |
|---|---|
| Landing carga < 3 s | Runbook (DevTools → Network → Load) |
| Muro de auth visible sin sesión | Runbook |
| Scan form NO visible sin sesión | Runbook |
| Registro nuevo → modal cierra → form visible | Runbook (+ backend `201` automatizado) |
| Email duplicado → "Este email ya está registrado." | Runbook (+ backend `409` automatizado) |
| Login incorrecto → "Credenciales incorrectas." | Runbook (+ backend `401` automatizado) |
| Login correcto → modal cierra → form visible | Runbook (+ backend `200` automatizado) |
| Recarga con sesión → form sigue visible | Runbook |
| Logout → vuelve el muro | Runbook |
| Form valida campos inválidos | Runbook |
| "Escanear" deshabilitado sin checkbox ético | Runbook |
| `/scan/start` sin JWT → `401` + mensaje visible | **Automatizado** (+ mensaje en runbook) |
| `/scan/start` con JWT → `202` en < 3 s | **Automatizado** |
| Redirección al Dashboard tras el `202` | Runbook |
| n8n: ejecución en execution history | Runbook (UI de n8n) |
| PostgreSQL: `SELECT` en `users` | **Automatizado** |
| PostgreSQL: `SELECT` en `scans` | **Automatizado** |
| Rate limiting: solicitud 11 → `429` | **Automatizado** (fase aparte, ver D-5) |

*Por qué.* Automatizar el navegador cuesta más que las 2 horas del change entero y produce un harness frágil que nadie mantendrá después de la defensa. Automatizar HTTP + SQL cuesta ~40 minutos y produce exactamente la parte que es tediosa, repetitiva y propensa al error humano a mano (contar 11 requests, comparar UUIDs, escribir SQL). La frontera está donde el costo se cruza, no donde está la capa.

*Alternativa descartada.* Todo manual: cumple el criterio literal del roadmap ("checklist manual/automatizado") pero no deja nada repetible — la próxima corrida es tan cara como la primera, y el `429` a mano es directamente hostil.

*Alternativa descartada.* Todo automatizado con CDP, como se hizo en CHANGE-20 para medir Lighthouse. Ahí el navegador headless resolvía **una** medición numérica; acá haría falta guiar modales, `localStorage` y navegación multi-paso. Desproporcionado.

### D-2: El suite E2E es opt-in por variable de entorno, y *skipea* — nunca falla — sin infraestructura

**Decisión.** Los tests viven en `fastapi_bridge/tests/e2e/`, llevan `@pytest.mark.e2e`, y un `conftest.py` local aplica `pytest.skip(allow_module_level=True)` salvo que `WASA_E2E=1`. Además, cada dependencia viva se comprueba en su propia fixture y su ausencia produce un skip con motivo legible (`"Bridge no responde en {base_url}/health"`, `"db_fuzzing inalcanzable"`).

*Por qué.* `pytest.ini` declara `testpaths = fastapi_bridge/tests`: sin la guarda, `pytest` a secas intentaría abrir conexiones a PostgreSQL y salir a internet en la máquina de cualquiera. Y la distinción *skip vs. fail* no es cosmética: si "falta levantar uvicorn" y "el login está roto" producen el mismo rojo, el suite deja de significar algo y la gente lo ignora — que es exactamente como mueren los smoke tests.

*Vigente aunque la infraestructura de este operador esté arriba.* El usuario confirmó que su entorno está completo (ver **Context**), así que la corrida de este change no debería producir ni un skip por dependencia ausente — y si lo produce, es un hallazgo. La guarda igual se implementa: existe para la siguiente persona que clone el repo y corra `pytest` sin saber nada de esto, no para tapar la ausencia de infraestructura acá.

*Alternativa descartada.* Un `pytest.ini` aparte o `--ignore` en la invocación normal: obliga a recordar un flag para el caso común y falla al primero que corra `pytest` sin leer el README. La guarda tiene que estar del lado peligroso, no del lado seguro.

### D-3: El suite se **conecta** a un Bridge que ya está corriendo; no lo levanta

**Decisión.** El suite lee `WASA_E2E_BASE_URL` (default `http://127.0.0.1:8000`), hace `GET /health` en una fixture de sesión, y skipea si no responde. El operador levanta `uvicorn` (y n8n, y la base) siguiendo el paso 1 del runbook.

*Por qué.* Levantar `uvicorn` como subproceso desde pytest exige gestionar puerto libre, espera de readiness, teardown en Windows (`CTRL_BREAK_EVENT` vs. `SIGTERM`), y captura de logs — media hora de plomería que solo sirve para no escribir un comando. Peor: escondería el `.env` real bajo el que corre el Bridge, que es justamente una de las cosas que este smoke test existe para validar.

*Consecuencia aceptada.* El suite no es hermético. Es deliberado: se está probando **el despliegue**, no el código.

### D-4: Identidad desechable por corrida; limpieza que solo borra lo propio

**Decisión.** Cada corrida genera `smoke+{uuid4().hex[:12]}@wasa.test` con una contraseña fija de test. Al terminar, una fixture borra **esa** fila de `users` por email, con `DELETE FROM users WHERE email = $1`. Las filas de `scans` que n8n haya creado **no se tocan**.

*Por qué.* Sin email único, la segunda corrida choca contra el `409` de RN-WS-13 y el criterio de "registro con email nuevo" deja de ser ejecutable — el suite se auto-envenena. El sufijo `@wasa.test` (TLD reservado por RFC 2606) hace la cuenta inconfundiblemente sintética y no enrutable.

Y el `DELETE` acotado por email es la única escritura destructiva de toda la validación: sobre `users`, que es tabla propia del Bridge. Borrar la fila de `scans` sería violar la regla dura del proyecto y además romper el Dashboard de la tesis, que la lee.

*Nota sobre el criterio de email duplicado.* Se ejercita registrando **dos veces el mismo** email desechable dentro de la corrida — no reutilizando una cuenta previa. Así el `409` se prueba sin depender de estado ajeno.

### D-5: El `429` se prueba en una fase aparte, contra un receptor local, y va **último**

**Decisión.** El criterio "solicitud 11 → `429`" se ejecuta en `test_smoke_rate_limit.py`, con marcador y flag propios (`WASA_E2E_RATELIMIT=1`), contra un Bridge **reiniciado** cuyo `N8N_WEBHOOK_URL` apunta a un receptor HTTP local trivial que responde `200` a todo. Es la última fase del runbook.

*Por qué es imprescindible.* Cumplir el criterio al pie de la letra contra el n8n real significaría **10 escaneos reales completos** (ZAP + Nuclei + ffuf + SQLMap ×10) contra el objetivo local para poder observar el rechazo del undécimo. Eso es media hora de cómputo, 10 tandas de tráfico agresivo contra la app en `:8081` (que además podría caerse y volver ambiguo el resultado), y 10 filas basura en la tabla `scans` de la tesis. Desproporcionado para verificar un contador en memoria que no sabe nada de n8n.

El rate limit es una decisión **enteramente del borde del Bridge**: `slowapi` cuenta antes de que `ScanService` toque nada. Apuntar el webhook a un receptor local prueba el mismo comportamiento observable — `202 ×10`, `429` al 11 — con cero efectos externos.

*Por qué va último y con reinicio.* El contador es in-memory y por IP de conexión. Las 10 aceptaciones agotan el presupuesto de `127.0.0.1` por 60 minutos, dejando cualquier escaneo posterior (automatizado o del runbook) en `429`. Correrlo al final y reiniciar el proceso `uvicorn` después es el "reset" del sistema — no hay otro.

*Alternativa descartada.* Bajar `RATE_LIMIT_REQUESTS` a 2 en el `.env` y probar con 3 requests: más barato aún, pero el criterio del roadmap dice "solicitud 11" y firmarlo con una política distinta a la de producción sería firmar otra cosa. Se conserva como plan B documentado en el runbook si el receptor local resulta impracticable.

### D-6: Las verificaciones de base se hacen con `asyncpg` crudo, no a través del `UserRepository`

**Decisión.** `tests/e2e/conftest.py` abre su propia conexión `asyncpg` con el `DATABASE_URL` del entorno y ejecuta SQL literal (`SELECT ... FROM users WHERE email = $1`, `SELECT ... FROM scans WHERE ...`).

*Por qué.* Un smoke test que verifica el efecto usando el mismo repositorio que produjo el efecto no verifica nada: si `UserRepository` tuviera un bug de mapeo, escribiría mal y leería mal, en verde. El oráculo tiene que ser independiente del sujeto. SQL crudo es ese oráculo.

Además `scans` **no tiene** repositorio en el Bridge — ni puede tenerlo, por la regla dura — así que para ese criterio no hay alternativa.

*Riesgo de frontera controlado.* `test_layer_boundaries.py` y `test_no_shared_db_impact.py` excluyen el árbol `tests/` de su barrido (`if "tests" in ...parts`), y `test_structure.py` valida una allowlist de 18 módulos, no un conjunto cerrado de directorios. Agregar `tests/e2e/` no dispara ninguno de los tres. **Se verifica corriendo la suite completa al final, no se asume.**

### D-7: Objetivo de escaneo local y bajo control del operador, parametrizado por entorno

**Decisión** (confirmada por el usuario, 2026-08-24)**.** El escaneo apunta a **`http://localhost:8081/`**, la aplicación vulnerable de pruebas que el operador ya corre en su propia máquina, con el `phpsessid` de una sesión válida de esa app. Ni la URL ni el `phpsessid` se escriben en código, tests, specs ni runbook: el suite los lee del entorno —`WASA_E2E_TARGET_URL` y `WASA_E2E_PHPSESSID`, junto a la guarda `WASA_E2E=1` de D-2— y skipea con motivo legible si faltan. Los valores reales viven únicamente en el `.env` local / el shell del operador, que ya está gitignoreado. Donde la documentación necesite ilustrar el payload, usa placeholders (`http://localhost:8081/`, `<phpsessid-de-tu-sesión-local>`).

*Por qué el objetivo local.* La justificación ética se vuelve trivialmente sólida: el operador escanea infraestructura **propia**, en su propio host, sin un solo paquete saliendo hacia un tercero. La declaración ética que el formulario le exige al usuario (RN-WS-01) se satisface por construcción, no por apelar a la política de uso de un sitio ajeno. Además elimina la dependencia de disponibilidad externa: un objetivo caído dejaría de ser "el sistema WASA anda mal" y volvería ambiguo el criterio de execution history.

*Por qué por variable de entorno y no como constante.* El `phpsessid` es una credencial de sesión, aunque sea de una app local: la regla dura del proyecto prohíbe hardcodear configuración, y un identificador de sesión commiteado en un fixture es exactamente el hábito que no se quiere normalizar en un producto de seguridad. Además el puerto y el `phpsessid` son propios de **cada** máquina — fijarlos en el repo garantizaría que el suite falle para el siguiente que lo corra.

*Cambio respecto de la versión previa de este diseño.* Se descarta `http://testphp.vulnweb.com/artists.php?artist=1` (el objetivo público de Acunetix que usan `test_scan_schemas.py`, `scan-payload-contract` y `scan-form-contracts`). Se pierde la consistencia literal con esos fixtures unitarios —que siguen intactos, no se tocan— a cambio de cero impacto sobre terceros y cero dependencia de la red. Es el intercambio correcto: aquellos son valores de ejemplo en tests con dobles, este es tráfico de escaneo real.

*Alternativa descartada.* `http://dvwa.local` (el placeholder del formulario): no resuelve en la mayoría de las máquinas y haría fallar el escaneo por una razón ajena al sistema.

### D-8: El runbook vive en un directorio `docs/` nuevo, en la raíz del repo

**Decisión** (confirmada por el usuario, 2026-08-24)**.** El runbook se escribe directamente en **`docs/e2e-smoke-test-runbook.md`**, creando el directorio `docs/` en la raíz del repo. La tabla firmada de **esta** corrida —fecha, operador, entorno, los 18 criterios con veredicto y evidencia— se registra aparte, en `openspec/changes/e2e-smoke-test/RESULTS.md`, y se archiva con el change.

*Por qué esa separación.* El runbook es documentación operativa viva: se abre antes de una demo o una defensa, meses después de que el change se archive, y `openspec/changes/archive/` es exactamente el lugar donde eso va a morir sin que nadie lo vuelva a mirar. La corrida firmada, en cambio, es evidencia fechada de este change: pertenece al change y envejece con él. El runbook lleva la **plantilla** vacía de esa tabla; `RESULTS.md` lleva la instancia completada.

*Por qué `docs/` y no `docs_wasa_sdd/`.* `docs_wasa_sdd/` es material de la tesis (fuente de la KB), no documentación operativa del producto; mezclarlos confundiría dos audiencias distintas. `docs/` nace limpio para documentación de operación.

### D-9: TDD estricto no aplica en su forma canónica a este change — **excepción aprobada por el usuario (2026-08-24)**

**Decisión.** El ciclo RED→GREEN→TRIANGULATE→REFACTOR se sustituye por un ciclo de validación equivalente y explícito, documentado en `tasks.md`: para cada criterio se escribe primero la aserción, se ejecuta contra el sistema, y el resultado se firma PASS o FAIL con evidencia.

*Por qué.* El modo TDD estricto del proyecto existe para que los tests **diseñen** el código de producción. Acá no hay código de producción que diseñar: el sistema ya está construido y archivado, y este change tiene prohibido modificarlo (Non-Goal 1). Un "RED" acá no significaría "todavía no lo implementé" sino "el producto está roto", que es un hallazgo, no un paso del ciclo.

Lo que **sí** se conserva del módulo TDD, porque sigue aplicando y es lo importante: la **red de seguridad** (`pytest` + `npm run test:run` en verde antes y después, para probar que la validación no rompió nada) y la **prohibición de aserciones triviales** (nada de `assert response is not None`; cada aserción compara contra el valor concreto que el criterio exige).

*Estado: **aprobada**.* El usuario revisó y aceptó explícitamente la excepción el 2026-08-24. Es una desviación declarada de una regla global del proyecto (Strict TDD Mode), **acotada a este change**: no sienta precedente para ningún otro, y el resto del módulo TDD (red de seguridad + prohibición de aserciones triviales) sigue siendo obligatorio acá.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| **El escaneo real es lento, o la app objetivo de `localhost:8081` se cae bajo el escaneo** → el `202` depende de que n8n acepte, no de que el escaneo termine; pero si el objetivo deja de responder, el workflow falla downstream y el criterio de execution history queda ambiguo. | El `202` y el criterio de n8n se firman por separado: el `202` mide la aceptación del Bridge (< 3 s), el historial mide que la ejecución **existe**, no que haya terminado bien. Si el objetivo se cayó, se firma el ítem de historial con la observación y se registra como hallazgo de entorno, no de producto. Al ser local, además, el operador puede reiniciarlo en segundos. |
| **El `phpsessid` local caduca entre la preparación y la corrida** → el escaneo se dispara con una sesión muerta y n8n produce resultados vacíos. | No afecta a ningún criterio del Bridge: el contrato termina en el `202`, y el valor viaja como payload opaco. El runbook indica renovar `WASA_E2E_PHPSESSID` justo antes de la fase de escaneo si el criterio de execution history se quiere firmar con una ejecución de contenido útil. |
| **El suite deja el rate limit agotado** y bloquea al operador durante 60 minutos. | D-5: fase última + reinicio de `uvicorn` documentado como paso explícito de cierre del runbook. El runbook lo advierte **antes** de la fase, no después. |
| **Falso verde por skip silencioso**: todo skipea, la corrida sale en verde, alguien firma los criterios. | El runbook exige transcribir el conteo de pytest (`N passed, M skipped`) en la tabla de evidencia. Un criterio no se puede firmar PASS contra un test que skipeó — la fixture reporta el motivo del skip y ese motivo va a la tabla. |
| **El `DELETE` de limpieza toca más de lo debido** si el email desechable colisionara. | `DELETE` acotado por igualdad exacta de email, con `uuid4` en el local-part y TLD `.test`. Sin `LIKE`, sin patrones, sin borrado por rango de fecha. |
| **Credenciales reales en el repo**: el suite necesita `DATABASE_URL`, tokens, y ahora también el `phpsessid` del objetivo local. | Se leen del entorno / `.env` existente (que ya está gitignoreado): `WASA_E2E_TARGET_URL` y `WASA_E2E_PHPSESSID` se suman a la lista (D-7). Ni el suite, ni las specs, ni el runbook contienen valores reales; nombran las variables y usan placeholders, nunca sus contenidos. Verificación explícita en las tasks 2.7b y 8.5: `git grep` del `phpsessid` real sobre el árbol versionado debe dar cero. |
| **El smoke test encuentra defectos y el change se convierte en una cacería de bugs** que desborda las 2 horas. | Non-Goal 1 es duro: se documenta y se sigue. La corrección es un change nuevo que decide el usuario. |
| **Fuera de `127.0.0.1` el rate limit no protege**: `get_remote_address` lee la IP TCP sin `X-Forwarded-For` (D-10 de CHANGE-04, decisión consciente). | Fuera de alcance de este change; se anota en el runbook como advertencia de despliegue detrás de proxy. |

## Migration Plan

No hay migración: el change no altera código de producción, esquema de base ni configuración desplegada. Un rollback es `git revert` de archivos de test y documentación.

La única mutación de entorno es la de D-5 (`N8N_WEBHOOK_URL` apuntando al receptor local durante la fase de rate limit) y el reinicio de `uvicorn` que la sigue. El runbook cierra restaurando la configuración original y verificando con un `GET /health` final.

## Open Questions

Ninguna. Las cuatro preguntas abiertas de la versión inicial de este diseño fueron respondidas por el usuario el 2026-08-24; quedan registradas abajo.

## Resolved Decisions (usuario, 2026-08-24)

1. **Infraestructura viva disponible.** PostgreSQL `db_fuzzing`, n8n con el Webhook Trigger del CHANGE-21 activo, el `.env` real del Bridge y la app objetivo en `localhost:8081` están levantados y alcanzables. El suite se escribe para correr de verdad; la guarda de opt-in y los skips por dependencia ausente (D-2) se conservan como higiene para otras máquinas, no como salida prevista de esta corrida. → reflejado en **Context** y en D-2.
2. **Objetivo de escaneo: `http://localhost:8081/`** (app vulnerable local del operador) con su `phpsessid`, ambos leídos del entorno vía `WASA_E2E_TARGET_URL` / `WASA_E2E_PHPSESSID` y nunca versionados. Se descarta `testphp.vulnweb.com`. → **D-7** reescrita.
3. **Excepción a TDD estricto aprobada.** D-9 deja de ser una propuesta a revisar: es una excepción aceptada, acotada a este change. → **D-9**.
4. **Destino del runbook: `docs/e2e-smoke-test-runbook.md`**, en un directorio `docs/` nuevo en la raíz (no `docs_wasa_sdd/`, no dentro del change). La tabla firmada de la corrida va a `openspec/changes/e2e-smoke-test/RESULTS.md`. → **D-8** reescrita.
