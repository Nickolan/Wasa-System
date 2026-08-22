## Context

Los dos scaffolds ya están en su lugar y son consistentes entre sí; lo que falta es el cableado.

**Estado del backend.** `fastapi_bridge/core/settings.py` (CHANGE-00a) ya implementa el contrato completo: nueve campos con type hints, `SecretStr` en `JWT_SECRET` y `N8N_WEBHOOK_TOKEN`, un `field_validator` que parsea `CORS_ORIGINS` de string separado por comas a `list[str]`, `_ENV_FILE` resuelto relativo al paquete (no al cwd) y `get_settings()` cacheado con `@lru_cache`. Está cubierto por `fastapi_bridge/tests/test_settings.py`. **No hay nada que implementar acá**: los defaults son de desarrollo (`wasa:wasa@localhost`, `dev-only-insecure-change-me`) y este change los reemplaza por valores reales en el `.env`.

**Estado del frontend.** `wasa-landing/src/shared/config/` contiene sólo un `.gitkeep` cuyo texto es literalmente `# CHANGE-00c — env.ts`: el scaffold dejó marcado el hueco. `wasa-landing/src/vite-env.d.ts` **no existe** — CHANGE-00b lo omitió, aunque `tsconfig.app.json` sí declara `"types": ["vite/client"]`, de modo que `import.meta.env` tipa hoy pero sin conocer nuestras variables.

**Estado de los valores.** Las dos preguntas de prioridad Alta de `knowledge-base/10_preguntas_abiertas.md` (que este change bloqueaban) ya fueron respondidas por el usuario: `DB_URL=postgresql+asyncpg://postgres:nikolan@localhost:5432/db_fuzzing`, `N8N_WEBHOOK_URL=http://localhost:5678/webhook/wasa-scan`, `N8N_WEBHOOK_TOKEN=wasapikey`. Como verificación cruzada, `dashboard/server-fuzzing/index.js` se conecta a `postgres`/`nikolan`/`localhost:5432`/`db_fuzzing` — exactamente los mismos datos, confirmando que el Bridge apunta a la instancia compartida correcta.

**Restricciones.**
- Regla dura del proyecto: NUNCA hardcodear configuración; una sola puerta de lectura por proyecto.
- El sistema WASA existente (`dashboard/`, n8n, worker) **no se modifica** — ni siquiera su configuración de puertos.
- Este change no abre conexiones: `DB_URL` se declara, no se usa. Quien la consume es CHANGE-02.
- Governance: **BAJO**. Autonomía completa si los tests pasan.

## Goals / Non-Goals

**Goals:**
- Que `Settings()` resuelva valores reales de `fastapi_bridge/.env` y que el frontend sepa a qué URL hablar.
- Dejar el contrato de configuración **documentado y verificable**: los `.env.example` versionados son la única fuente que un clon del repo recibe, y una prueba automática garantiza que no se desactualicen respecto de `Settings`.
- Que ningún secreto real llegue nunca al repositorio, ni por `.env`, ni por artefactos de planificación, ni por logs.
- Materializar en el frontend la contraparte de la regla "una sola puerta de configuración", con validación fail-fast.

**Non-Goals:**
- **No** se toca `core/settings.py`: su contrato ya está implementado y probado.
- **No** se implementa el cliente Axios (CHANGE-16), el `authStore` (CHANGE-13), CORS/rate limiting efectivos (CHANGE-11) ni la llamada a n8n (CHANGE-12/21). Este change sólo deja disponibles los valores que esos changes consumirán.
- **No** se abre conexión a PostgreSQL ni se corre DDL. Validar que `DB_URL` conecta es trabajo de CHANGE-02.
- **No** se configura entorno de producción. Todos los valores son de desarrollo local; el despliegue es CHANGE-22.
- **No** se modifica el Dashboard existente, incluida su configuración de puerto (ver D-4).

## Decisions

### D-1 — Capability nueva `runtime-configuration`, no una extensión de `bridge-bootstrap`

El requisito "Configuración tipada desde el entorno" ya vive en `bridge-bootstrap` y describe la **clase** `Settings`. Lo que este change agrega es distinto en naturaleza y en alcance: es un contrato **operativo** (dónde viven los valores, qué se versiona y qué no, cómo se generan los secretos) y **atraviesa los dos proyectos**, backend y frontend. Meterlo dentro de `bridge-bootstrap` lo dejaría en el lugar equivocado para la mitad frontend.

*Alternativa considerada:* dos deltas, uno sobre `bridge-bootstrap` y otro sobre `landing-bootstrap`. Rechazada: partiría en dos un contrato que sólo tiene sentido leído junto — la coherencia entre `CORS_ORIGINS` y `VITE_API_BASE_URL` es precisamente una propiedad *entre* los dos proyectos, y no tiene dónde vivir si el spec se parte.

Sí se modifica `landing-bootstrap`, pero por una razón acotada: su escenario "Sin cliente HTTP configurado ni variables de entorno" deja de ser verdadero en la mitad de entorno. `bridge-bootstrap` queda intacto — su escenario "Arranque sin `.env` presente" sigue siendo cierto, porque los defaults de `Settings` no se tocan.

### D-2 — `JWT_SECRET` se genera en tiempo de apply; nunca se escribe a mano

El valor efectivo se produce con `python -c "import secrets; print(secrets.token_hex(32))"` en el momento de escribir el `.env`, y **no aparece en ningún artefacto versionado** (ni en este design, ni en tasks, ni en un mensaje de commit). Un secreto que alguna vez estuvo en un archivo versionado sigue en el historial de git para siempre; la única defensa barata es que nunca entre.

`secrets.token_hex(32)` da 256 bits de entropía en 64 caracteres hexadecimales — sobrado para HS256, que es el algoritmo elegido para los JWT (`knowledge-base/08_arquitectura_propuesta.md`), y sin caracteres que puedan romper el parseo del `.env`.

*Alternativa considerada:* pedirle el secreto al usuario. Rechazada: los humanos eligen secretos malos y el hecho de tener que transmitirlo ya es un canal de fuga. Generarlo localmente es mejor en las dos dimensiones.

### D-3 — `VITE_API_BASE_URL=http://localhost:8000`, sin el prefijo de versión

El puerto es el default de Uvicorn, con el que arranca el Bridge según lo especificado en `bridge-bootstrap`. La variable guarda **sólo el origen**, no `http://localhost:8000/api/v1`: el prefijo de rutas es una decisión de la capa de API, y quien lo compone es el cliente Axios de CHANGE-16. Si el prefijo viviera dentro de la variable de entorno, un cambio de versionado de la API obligaría a editar el `.env` de cada entorno desplegado.

Simétricamente, `CORS_ORIGINS=http://localhost:5173` coincide con el `server.port: 5173, strictPort: true` que `wasa-landing/vite.config.ts` ya declara. Ese `strictPort: true` es una ventaja acá: garantiza que la Landing siempre esté en 5173 o no arranque, nunca en un puerto sorpresa que CORS rechazaría en silencio.

### D-4 — `VITE_DASHBOARD_URL=http://localhost:5174`, con una colisión de puertos conocida

**Descubrimiento relevante:** el Dashboard existente son *dos* procesos, no uno. `dashboard/server-fuzzing/` es una API Express con `const port = 5000` hardcodeado, y `dashboard/dashboard-fuzzing/` es una app React + Vite **sin `server.port` configurado**, es decir, con el default de Vite: **5173**. El mismo puerto que `wasa-landing` reclama con `strictPort: true`.

`VITE_DASHBOARD_URL` es un **destino de redirección de navegador** (`knowledge-base/02_descripcion_general.md`: *"Destino de redirección tras iniciar un escaneo… no API directa desde el Bridge"*), así que apunta al frontend React, no a la API Express de 5000.

Con la Landing ocupando 5173, Vite mueve al Dashboard al siguiente puerto libre: **5174**. Ese es el valor que se escribe. La solución limpia —fijarle un puerto explícito al Dashboard— está **vedada por la regla dura de no modificar el sistema existente**, así que el valor queda como convención de desarrollo documentada, sujeta a que el orden de arranque sea el habitual (Landing primero). Queda registrado en Open Questions para confirmación del usuario; es un valor de un `.env` local, trivial de corregir, y no justifica bloquear un change de governance BAJO.

### D-5 — `env.ts` valida y falla ruidosamente; no ofrece defaults

El módulo lee `import.meta.env`, verifica que cada variable requerida esté presente y no vacía, y lanza un error nombrando la variable faltante si no lo está. No hay fallback a `http://localhost:8000`.

La razón es el modo de fallo que se evita. Un default silencioso convierte "olvidé el `.env`" en "la app arranca y le pega al servidor equivocado" — un bug que se manifiesta lejos de su causa. Peor aún es no validar nada: `undefined` se propaga hasta `axios.create({ baseURL: undefined })`, que no falla al construirse sino más tarde, en la primera petición, con un mensaje que no menciona configuración. Fallar al cargar el módulo pone el error a centímetros de su causa.

Vite hace la validación barata: sustituye `import.meta.env.VITE_*` en tiempo de build, así que una variable ausente es un problema detectable en el arranque del dev server o del build, no un misterio de producción.

Nota FSD: `env.ts` vive en `shared/config/` y no importa nada de las capas superiores — `shared/` no conoce dominio. Es un módulo hoja.

### D-6 — Los `.env` reales pueden requerir intervención manual del usuario

**Restricción operativa verificada durante el propose:** la configuración de permisos del agente (`.claude/settings.json`) deniega herramientas sobre rutas `.env`. Un intento de leer `fastapi_bridge/.env` durante esta fase fue rechazado. Es la política correcta —el agente no debería andar leyendo secretos— pero significa que el apply **puede no poder escribir los `.env` reales por sí mismo**.

Plan de contingencia para el apply, en orden:
1. Intentar la escritura normalmente; puede que el permiso aplique sólo a lectura, o que el usuario apruebe el prompt.
2. Si se deniega: escribir los `.env.example` (que **no** son secretos y no están cubiertos por la regla), generar el `JWT_SECRET` e imprimirlo, y entregarle al usuario el contenido exacto de cada `.env` para que lo pegue él.
3. Verificar el resultado indirectamente, sin leer los archivos: `Settings().DB_URL` refleja los valores esperados, y los tests de contrato pasan.

Esto no es un blocker del change: es un paso manual acotado, y la propiedad que importa —que los secretos no pasen por el agente ni por el repo— sale reforzada.

### D-7 — Los tests verifican el contrato, no los valores

Ningún test asserta que `DB_URL == "postgresql+asyncpg://postgres:nikolan@..."`. Un test así metería la credencial real en un archivo versionado, deshaciendo el objetivo entero del change, y además fallaría en cualquier máquina con otro entorno.

Lo que se prueba es estructural y sí es estable en todas las máquinas:
- **Paridad**: las claves de `.env.example` son exactamente los campos de `Settings`. Es el test que evita la deriva de la documentación, el modo de fallo más probable de este change a seis meses vista.
- **Cargabilidad**: instanciar `Settings` apuntando a `.env.example` funciona — o sea, los placeholders respetan los tipos (`TOKEN_EXPIRE_HOURS=24`, no `changeme`).
- **Ignorado**: `git check-ignore` confirma que los `.env` reales están cubiertos, y `git ls-files` que no están trackeados.
- **Frontend**: `env.ts` lanza con el nombre de la variable cuando falta, y devuelve los valores cuando están. Se testea con `vi.stubEnv`, sin depender de ningún `.env` del disco.
- **Puerta única**: un test estático confirma que `import.meta.env` sólo aparece dentro de `env.ts`, replicando el test equivalente que ya existe en el backend para `os.environ`.

### D-8 — Excepción explícita en `.gitignore` para los ejemplos

`.gitignore` ya tiene `.env`, `fastapi_bridge/.env` y `wasa-landing/.env`. Ninguno de esos patrones alcanza a `*.env.example` (git hace match del nombre completo, y `.env.example` ≠ `.env`), así que hoy los ejemplos **ya se versionarían** correctamente. Aun así se agrega un `!*.env.example` explícito: es defensa contra el futuro en el que alguien "arregla" el ignore poniéndolo `.env*`, que sí los tragaría y devolvería el repo a no documentar nada. El costo es una línea; el fallo que previene es silencioso.

Se agrega también `.env.local` y `.env.*.local` a los ignorados: Vite los carga automáticamente y son el lugar natural donde un desarrollador pone overrides personales.

## Risks / Trade-offs

- **Los permisos del agente bloquean la escritura de los `.env` reales** → D-6: el apply degrada a entregarle el contenido al usuario y verifica indirectamente vía `Settings()` y la suite. El change se completa igual.
- **`VITE_DASHBOARD_URL=5174` depende del orden de arranque** → si el Dashboard levanta antes que la Landing, se queda con 5173 y la Landing (con `strictPort`) directamente no arranca — un fallo ruidoso, no silencioso, y por lo tanto barato de diagnosticar. Registrado en Open Questions; la corrección es editar un `.env` local.
- **La contraseña real de PostgreSQL queda en un archivo de disco en claro** → es inherente al mecanismo `.env` y aceptable en desarrollo local. Mitigación: nunca se versiona (D-2, D-8), y `Settings` la envuelve en el `DB_URL` que ya se maneja como sensible. Para producción, CHANGE-22 debería usar un gestor de secretos, no un `.env` desplegado.
- **Deriva entre `.env.example` y `Settings` con el paso del tiempo** → mitigado por el test de paridad de D-7, que es exactamente el guardián de ese riesgo: agregar un campo sin documentarlo rompe la suite.
- **Un futuro módulo del frontend puede saltarse `env.ts` y leer `import.meta.env` directo** → mitigado por el test estático de puerta única (D-7). Es la misma estrategia que el backend ya usa contra `os.environ`, y ha demostrado funcionar ahí.
- **Los valores confirmados apuntan todos a `localhost`** → este change configura desarrollo local, nada más. Producción es alcance de CHANGE-22, y los `.env.example` son el contrato que ese change instanciará con otros valores.

## Migration Plan

No hay migración de datos ni de esquema: se crean archivos que no existían y se completa uno vacío.

**Orden de trabajo** (detallado en `tasks.md`): backend primero (`.env.example` → `.env` → tests), frontend después (`vite-env.d.ts` → `env.ts` → `.env.example` → `.env` → tests), y `.gitignore` al final, verificando con `git check-ignore` y `git ls-files` que la línea divisoria entre versionado y no versionado quedó donde debe.

**TDD** (modo estricto activo). Los archivos `.env*` son configuración estática y no admiten ciclo RED→GREEN de forma significativa: se escriben directamente y las pruebas de paridad e ignorado se agregan como verificación. Donde el ciclo **sí aplica en forma completa** es en el único código real de este change, `env.ts`: primero el test de que lanza nombrando la variable ausente (RED), después la implementación mínima (GREEN), después triangulación con el caso de cadena vacía y con el caso feliz, y recién ahí el refactor. Antes de tocar `.gitignore` y `wasa-landing/src/`, se captura la red de seguridad corriendo las suites existentes de ambos proyectos y anotando el baseline.

**Rollback**: borrar los archivos creados y revertir `.gitignore`. Como `Settings` conserva sus defaults, el backend arranca igual sin `.env`; el frontend vuelve al estado de CHANGE-00b restaurando el `.gitkeep`. No queda estado externo que deshacer.

## Open Questions

- **`VITE_DASHBOARD_URL`**: se escribe `http://localhost:5174` por el análisis de D-4 (el Dashboard React cede el 5173 a la Landing). Confirmar con el usuario a qué URL abre él el Dashboard en su máquina. Es una línea de un `.env` local: se corrige en segundos si el valor es otro.
- **Puerto del Bridge**: se asume el 8000 por defecto de Uvicorn. Si en la práctica se lanza con otro `--port`, hay que alinear `VITE_API_BASE_URL`.
- **Producción**: los `.env.example` documentan el contrato, pero de dónde salen los valores reales al desplegar (gestor de secretos, variables del orquestador, `.env` inyectado) es una decisión de CHANGE-22, fuera de alcance acá.
