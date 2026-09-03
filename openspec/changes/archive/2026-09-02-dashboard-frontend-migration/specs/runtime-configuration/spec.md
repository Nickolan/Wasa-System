## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Los dos proyectos coinciden en el punto de encuentro
**Reason**: El requisito describía una topología de tres orígenes —la Landing, el Bridge y un Dashboard standalone—, y exigía explícitamente que `VITE_DASHBOARD_URL` y `VITE_API_BASE_URL` fueran URLs distintas. Con la pantalla de resultados migrada a la ruta `/dashboard` de la propia Landing (`dashboard-screen`), ese tercer origen deja de existir: no hay una dirección de Dashboard que comparar contra la del Bridge. Lo reemplaza el requisito "La Landing y el Bridge coinciden en el único punto de encuentro del sistema", que conserva intactas las dos coherencias que siguen vigentes (CORS ↔ servidor de desarrollo, y `VITE_API_BASE_URL` ↔ Bridge) y agrega la garantía de que no queda un segundo origen configurado.

**Migration**: Quitar `VITE_DASHBOARD_URL` de `wasa-landing/.env`, de `wasa-landing/.env.example`, de `src/vite-env.d.ts` y de la tabla de variables de entorno del `README.md`. Un despliegue que la siga declarando no falla: la variable simplemente deja de leerse. Los enlaces que la usaban pasan a ser navegación interna a `/dashboard`. No hay nada que reconfigurar del lado del Bridge: la consulta de resultados viaja al mismo origen que ya declara `VITE_API_BASE_URL`.
