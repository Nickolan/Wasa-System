# runtime-configuration Specification

## Purpose
TBD - created by archiving change env-config. Update Purpose after archive.
## Requirements
### Requirement: Contrato de variables de entorno del backend
El FastAPI Bridge SHALL declarar su configuración de runtime en `fastapi_bridge/.env`, con exactamente las nueve variables del contrato de `Settings`: `JWT_SECRET`, `TOKEN_EXPIRE_HOURS`, `DB_URL`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`, `CORS_ORIGINS`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW` y `APP_ENV`, nombradas en `UPPER_SNAKE_CASE`.

#### Scenario: Settings resuelve los valores del archivo
- **WHEN** existe `fastapi_bridge/.env` con `TOKEN_EXPIRE_HOURS=24` y se instancia `Settings()` desde cualquier directorio de trabajo
- **THEN** `settings.TOKEN_EXPIRE_HOURS == 24` como entero, resuelto desde el archivo y no desde el default de la clase

#### Scenario: La conexión apunta a la instancia compartida
- **WHEN** se lee `settings.DB_URL`
- **THEN** el valor usa el driver `postgresql+asyncpg` y la base `db_fuzzing`, la misma instancia que ya usa el sistema WASA existente

#### Scenario: El destino de n8n queda declarado
- **WHEN** se leen `settings.N8N_WEBHOOK_URL` y `settings.N8N_WEBHOOK_TOKEN`
- **THEN** ambos tienen valores reales de la instancia n8n desplegada, y ninguno conserva el placeholder de desarrollo `dev-only-insecure-change-me`

#### Scenario: Declarar no es conectar
- **WHEN** se instancia `Settings()` con `DB_URL` y `N8N_WEBHOOK_URL` apuntando a servicios inaccesibles
- **THEN** la instanciación tiene éxito sin abrir ninguna conexión de red ni de base de datos

### Requirement: Los valores reales nunca entran al repositorio
Ningún archivo `.env` con valores reales SHALL estar versionado. El repositorio SHALL versionar únicamente los `.env.example` con placeholders inertes, de modo que clonar el repo nunca entregue credenciales pero siempre entregue el contrato.

#### Scenario: Los .env reales están ignorados
- **WHEN** se consulta a git por `fastapi_bridge/.env` y `wasa-landing/.env`
- **THEN** ambos están cubiertos por `.gitignore` y ninguno aparece en el índice de archivos versionados

#### Scenario: Los ejemplos sí están versionados
- **WHEN** se consulta a git por `fastapi_bridge/.env.example` y `wasa-landing/.env.example`
- **THEN** ambos aparecen como archivos versionados, sin que las reglas de ignorado de `.env` los alcancen

#### Scenario: Los ejemplos no contienen secretos
- **WHEN** se inspecciona el contenido de cualquier `.env.example`
- **THEN** los valores de `JWT_SECRET`, `N8N_WEBHOOK_TOKEN` y la contraseña embebida en `DB_URL` son placeholders inertes, y no reproducen ningún valor real en uso

#### Scenario: Historial limpio
- **WHEN** se revisa el historial de commits del repositorio
- **THEN** no existe ningún commit que haya introducido un archivo `.env` con valores reales

### Requirement: Los secretos se generan, no se transcriben
`JWT_SECRET` SHALL producirse mediante un generador criptográficamente seguro en el momento de escribir el `.env`, y no copiarse de documentación, de un proposal, de un design ni de ninguna otra fuente legible.

#### Scenario: Origen del secreto de firma
- **WHEN** se escribe `JWT_SECRET` en `fastapi_bridge/.env`
- **THEN** el valor proviene de `secrets.token_hex(32)` (u otro CSPRNG equivalente) ejecutado en ese momento, y tiene al menos 64 caracteres hexadecimales

#### Scenario: El secreto no queda registrado en el repo
- **WHEN** se buscan los artefactos versionados del change (`proposal.md`, `design.md`, `tasks.md`, specs)
- **THEN** ninguno contiene el valor efectivo de `JWT_SECRET`

#### Scenario: Los secretos no se filtran al serializar
- **WHEN** se serializa o loguea el objeto `Settings`
- **THEN** `JWT_SECRET` y `N8N_WEBHOOK_TOKEN` se muestran enmascarados (`SecretStr`) y nunca en texto plano

### Requirement: El ejemplo del backend refleja el contrato de Settings
`fastapi_bridge/.env.example` SHALL mantenerse en paridad exacta con los campos declarados en `fastapi_bridge/core/settings.py`: ni una variable de más, ni una de menos. Esta paridad SHALL ser verificable de forma automática, para que agregar un campo a `Settings` sin documentarlo rompa la suite.

#### Scenario: Paridad de claves
- **WHEN** se comparan las claves de `fastapi_bridge/.env.example` contra los nombres de campo de `Settings`
- **THEN** ambos conjuntos son idénticos

#### Scenario: Campo nuevo sin documentar
- **WHEN** se agrega un campo a `Settings` y no se agrega su clave a `.env.example`
- **THEN** la verificación de paridad falla e identifica la clave faltante

#### Scenario: El ejemplo es cargable
- **WHEN** se instancia `Settings` usando `fastapi_bridge/.env.example` como archivo de entorno
- **THEN** la instanciación tiene éxito: los placeholders respetan los tipos declarados (los numéricos son numéricos, no la palabra `changeme`)

### Requirement: Puerta única de configuración en el frontend
La Landing SHALL acceder a su configuración de runtime exclusivamente a través de `wasa-landing/src/shared/config/env.ts`, que expone `VITE_API_BASE_URL` como valor ya validado. Ningún otro módulo de `src/` SHALL leer `import.meta.env` directamente, del mismo modo que ningún módulo del backend lee `os.environ` fuera de `core/settings.py`.

La puerta SHALL exponer únicamente las variables que la Landing efectivamente consume. `VITE_DASHBOARD_URL` SHALL NOT formar parte de su superficie: desde que la pantalla de resultados es una ruta de la propia Landing (`dashboard-screen`), no existe ningún destino externo que configurar, y mantener la variable obligaría a todo despliegue a declarar un valor que nada lee.

#### Scenario: Superficie exportada
- **WHEN** se importa el módulo de configuración vía el alias `@shared/config/env`
- **THEN** expone la URL base del FastAPI Bridge como cadena no vacía

#### Scenario: La dirección del Dashboard ya no se configura
- **WHEN** se inspecciona la superficie exportada del módulo de configuración
- **THEN** no expone ninguna dirección de Dashboard, y ningún módulo de `src/` importa una

#### Scenario: Acceso único a import.meta.env
- **WHEN** se buscan ocurrencias de `import.meta.env` en `wasa-landing/src/`
- **THEN** la única aparición está dentro de `src/shared/config/env.ts`

#### Scenario: El módulo respeta las fronteras FSD
- **WHEN** se inspeccionan los imports de `src/shared/config/env.ts`
- **THEN** no importa nada de `entities/`, `features/`, `widgets/`, `pages/` ni `app/`: `shared/` no conoce dominio

### Requirement: La configuración ausente falla de forma ruidosa
Si una variable `VITE_*` requerida falta o está vacía, el módulo de configuración SHALL lanzar un error explícito que nombre la variable, en vez de propagar `undefined` hacia sus consumidores. Un cliente HTTP apuntando a `undefined` es un fallo silencioso que se manifiesta recién en runtime, lejos de su causa.

Recíprocamente, una variable `VITE_*` que la Landing ya no consume SHALL NOT ser requerida: su ausencia SHALL NOT impedir el arranque, y su presencia SHALL NOT tener efecto.

#### Scenario: Variable ausente
- **WHEN** se carga el módulo de configuración sin `VITE_API_BASE_URL` definida
- **THEN** se lanza un error cuyo mensaje incluye el nombre exacto de la variable faltante

#### Scenario: Variable presente pero vacía
- **WHEN** `VITE_API_BASE_URL` está definida como cadena vacía o sólo espacios
- **THEN** se trata como ausente y se lanza el mismo error explícito

#### Scenario: Configuración completa
- **WHEN** `VITE_API_BASE_URL` está definida con un valor no vacío
- **THEN** el módulo se carga sin errores y devuelve exactamente ese valor

#### Scenario: Una variable dada de baja no bloquea el arranque
- **WHEN** se carga el módulo de configuración sin `VITE_DASHBOARD_URL` definida
- **THEN** el módulo se carga sin errores: la variable dejó de ser requerida

#### Scenario: Una variable dada de baja no tiene efecto
- **WHEN** se carga el módulo de configuración con `VITE_DASHBOARD_URL` definida con cualquier valor
- **THEN** el módulo se carga igual y ese valor no altera ninguna dirección que la Landing use

### Requirement: Las variables Vite están tipadas
El proyecto SHALL declarar las variables `VITE_*` que consume en la interfaz `ImportMetaEnv` de `wasa-landing/src/vite-env.d.ts`, de modo que TypeScript las conozca como `string` y un error de tipeo en el nombre se detecte al compilar y no en producción. Una variable dada de baja SHALL retirarse de esa interfaz: dejarla declarada anunciaría un contrato de configuración que ya no existe.

#### Scenario: Tipos disponibles
- **WHEN** se compila el proyecto con `tsc`
- **THEN** `VITE_API_BASE_URL` resuelve al tipo `string` y no a `any` ni a `unknown`

#### Scenario: La variable dada de baja no está declarada
- **WHEN** se inspecciona la interfaz `ImportMetaEnv` del proyecto
- **THEN** no declara `VITE_DASHBOARD_URL`

#### Scenario: Compilación limpia
- **WHEN** se ejecuta la verificación de tipos del proyecto tras incorporar el módulo de configuración
- **THEN** termina sin errores

### Requirement: La Landing y el Bridge coinciden en el único punto de encuentro del sistema
La URL base que la Landing usa para hablarle al Bridge y el origen que el Bridge acepta por CORS SHALL ser coherentes entre sí en el entorno de desarrollo: lo que un lado emite es lo que el otro admite.

Con la pantalla de resultados servida por la propia Landing y sus datos servidos por el Bridge, ese punto de encuentro SHALL ser el único que el sistema necesita: el contrato de configuración de la Landing SHALL declarar un único destino de red y NO SHALL existir un segundo origen de aplicación que mantener sincronizado.

#### Scenario: Coherencia entre CORS_ORIGINS y el servidor de desarrollo
- **WHEN** se comparan `CORS_ORIGINS` de `fastapi_bridge/.env` con el puerto declarado en `wasa-landing/vite.config.ts`
- **THEN** el origen del servidor de desarrollo de la Landing está incluido en la lista de orígenes permitidos

#### Scenario: Coherencia entre VITE_API_BASE_URL y el Bridge
- **WHEN** se compara `VITE_API_BASE_URL` con el host y puerto donde se sirve el FastAPI Bridge en desarrollo
- **THEN** coinciden, de modo que las peticiones de la Landing llegan al Bridge sin reescritura ni proxy

#### Scenario: No hay un segundo origen configurado
- **WHEN** se inspecciona el contrato de configuración de la Landing
- **THEN** declara un único destino de red —el Bridge—: no hay una segunda dirección de aplicación que mantener sincronizada

