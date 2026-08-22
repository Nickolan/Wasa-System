## ADDED Requirements

### Requirement: El proyecto arranca en modo desarrollo
La Landing Page SHALL existir como proyecto Vite en `wasa-landing/`, capaz de arrancar su servidor de desarrollo sin ninguna dependencia de infraestructura externa (FastAPI Bridge, PostgreSQL, n8n) disponible.

#### Scenario: Arranque del dev server
- **WHEN** se ejecuta `npm run dev` dentro de `wasa-landing/`
- **THEN** Vite levanta sin errores ni tracebacks y sirve la aplicación en `http://localhost:5173`

#### Scenario: El puerto 5173 es explícito, no incidental
- **WHEN** el puerto `5173` está ocupado por otro proceso
- **THEN** el dev server falla con un error explícito en lugar de reasignarse silenciosamente a otro puerto

#### Scenario: Arranque sin backend disponible
- **WHEN** se abre la aplicación con el FastAPI Bridge apagado
- **THEN** la página renderiza correctamente y no se emite ninguna petición de red fallida (el scaffold no consume ninguna API)

### Requirement: El proyecto compila sin errores de tipos
El proyecto SHALL producir un build de producción y pasar el chequeo de tipos de TypeScript en modo estricto, sin errores ni warnings de compilación.

#### Scenario: Build de producción
- **WHEN** se ejecuta `npm run build`
- **THEN** el comando termina con código de salida `0` y genera los artefactos en `dist/`

#### Scenario: Chequeo de tipos aislado
- **WHEN** se ejecuta `tsc --noEmit`
- **THEN** no se reporta ningún error de tipos en el árbol de `src/`

#### Scenario: Sin restos del template de Vite
- **WHEN** se inspecciona el árbol de `wasa-landing/src/`
- **THEN** no existen `src/main.tsx`, `src/App.css`, `src/index.css` ni `src/assets/react.svg`, y ningún archivo referencia el contador de demo del template

### Requirement: Estructura de capas Feature-Sliced Design
El árbol `wasa-landing/src/` SHALL materializar en el filesystem las seis capas FSD definidas en `knowledge-base/08_arquitectura_propuesta.md`, de modo que cada change posterior tenga un destino inequívoco para su código.

#### Scenario: Las seis capas existen
- **WHEN** se inspecciona `wasa-landing/src/`
- **THEN** existen los directorios `app/`, `pages/`, `widgets/`, `features/`, `entities/` y `shared/`

#### Scenario: Subdirectorios comprometidos por el roadmap
- **WHEN** se inspeccionan las capas `app/` y `shared/`
- **THEN** existen `app/stores/`, `app/providers/`, `shared/ui/`, `shared/api/`, `shared/config/` y `shared/lib/`

#### Scenario: El punto de entrada vive en la capa app
- **WHEN** se inspecciona `index.html`
- **THEN** su `<script type="module">` apunta a `/src/app/main.tsx`, y ese archivo existe y monta la aplicación React

#### Scenario: La app renderiza el placeholder de la Landing
- **WHEN** se renderiza `src/app/App.tsx`
- **THEN** el árbol resultante contiene el componente `LandingPage` definido en `src/pages/LandingPage/index.tsx`

### Requirement: Fronteras de import entre capas FSD
Las capas SHALL respetar una dirección de dependencia única y descendente: `app → pages → widgets → features → entities → shared`. Ninguna capa SHALL importar de una capa superior, y `shared/` SHALL permanecer libre de todo conocimiento del dominio WASA.

#### Scenario: Ninguna capa importa hacia arriba
- **WHEN** se inspeccionan los imports de todos los archivos bajo `src/`
- **THEN** ningún archivo de una capa dada importa de una capa que la precede en el orden `app → pages → widgets → features → entities → shared`

#### Scenario: shared no conoce el dominio
- **WHEN** se inspeccionan los imports de los archivos bajo `src/shared/`
- **THEN** no aparece ningún import de `@app`, `@pages`, `@widgets`, `@features` ni `@entities`

#### Scenario: La regla se verifica automáticamente
- **WHEN** se introduce deliberadamente un import que viola la dirección de capas
- **THEN** la suite de tests falla identificando el archivo y el import infractor

### Requirement: Path aliases resueltos en build y en type-check
Los imports entre capas SHALL escribirse con los alias `@app`, `@pages`, `@widgets`, `@features`, `@entities` y `@shared`, y estos SHALL resolver de forma idéntica en el bundler (Vite), en el compilador de TypeScript y en el runner de tests.

#### Scenario: Resolución en tiempo de build
- **WHEN** un módulo importa mediante un alias (por ejemplo `import { LandingPage } from "@pages/LandingPage"`)
- **THEN** `npm run build` resuelve el módulo y completa sin error de resolución

#### Scenario: Resolución en el chequeo de tipos
- **WHEN** se ejecuta `tsc --noEmit` sobre un módulo que importa mediante alias
- **THEN** TypeScript resuelve el tipo del módulo importado sin reportar `Cannot find module`

#### Scenario: Los seis alias están declarados
- **WHEN** se inspeccionan `vite.config.ts` y la configuración de TypeScript de la aplicación
- **THEN** ambos declaran los seis alias apuntando a los directorios de capa correspondientes bajo `src/`

### Requirement: Pipeline de estilos Tailwind operativo
La aplicación SHALL procesar Tailwind CSS 4 mediante el plugin `@tailwindcss/vite` dentro del build de Vite, con la hoja de estilos global en la capa `app/`. El proyecto NO SHALL contener archivos de configuración propios de Tailwind 3 (`tailwind.config.*`, `postcss.config.*`) ni la dependencia `autoprefixer`.

#### Scenario: Las utilidades de Tailwind se aplican
- **WHEN** un componente usa clases utilitarias de Tailwind y la aplicación se renderiza en el navegador
- **THEN** las reglas CSS correspondientes están presentes y el estilo se aplica visualmente

#### Scenario: La hoja global vive en la capa app
- **WHEN** se inspecciona el árbol de estilos
- **THEN** `src/app/index.css` contiene `@import "tailwindcss"` (y ninguna directiva `@tailwind base/components/utilities`, inexistente en la versión 4) y ese archivo se importa desde `src/app/main.tsx`

#### Scenario: La integración es el plugin de Vite, no PostCSS
- **WHEN** se inspecciona `vite.config.ts` y la raíz del proyecto
- **THEN** el plugin `@tailwindcss/vite` está registrado entre los plugins de Vite, y no existen `tailwind.config.*` ni `postcss.config.*` ni `autoprefixer` declarado en `package.json`

#### Scenario: El escaneo de fuentes alcanza todo el árbol FSD
- **WHEN** un componente ubicado en cualquier capa bajo `src/` usa clases utilitarias y se genera el build
- **THEN** las utilidades usadas por ese componente aparecen en el CSS emitido, sin necesidad de declarar un campo `content`

### Requirement: Dependencias del stack frontend disponibles
El `package.json` SHALL declarar el stack completo que el roadmap consume en changes posteriores, en las versiones de la tabla de stack del proyecto, y cada dependencia SHALL ser importable sin error.

#### Scenario: Manifiesto completo
- **WHEN** se inspeccionan las dependencias de runtime de `package.json`
- **THEN** figuran `react`, `react-dom`, `react-hook-form`, `zod`, `@hookform/resolvers`, `axios` y `zustand`

#### Scenario: Zustand importable
- **WHEN** se importa `create` desde `zustand`
- **THEN** el import resuelve y expone una función, sin error de módulo ni de tipos

#### Scenario: Runner de tests operativo
- **WHEN** se ejecuta el comando de tests del proyecto
- **THEN** el runner arranca, descubre la suite y reporta resultados sin errores de configuración

### Requirement: El scaffold no implementa funcionalidad de dominio
El change SHALL limitarse a la estructura. Ninguna regla de negocio, store, schema de validación, componente de UI reutilizable ni cliente HTTP SHALL implementarse en este estadio; cada uno pertenece a su change declarado en el roadmap.

#### Scenario: Sin authStore
- **WHEN** se inspecciona `src/app/stores/`
- **THEN** no existe `authStore.ts` (pertenece a CHANGE-13) y el directorio queda vacío, marcado únicamente con un `.gitkeep` anotado (D-10)

#### Scenario: Sin schemas ni componentes de dominio
- **WHEN** se inspeccionan `src/entities/`, `src/shared/ui/` y `src/features/`
- **THEN** no existen schemas Zod, ni los átomos `Button`/`Input`/`Checkbox`/`Spinner`/`Modal`, ni features de auth o de scan (pertenecen a CHANGE-14 a CHANGE-18)

#### Scenario: Sin cliente HTTP configurado ni variables de entorno
- **WHEN** se inspeccionan `src/shared/api/` y `src/shared/config/`
- **THEN** no existe una instancia de Axios con interceptor Bearer (CHANGE-16) ni `env.ts`, y no se versiona ningún archivo `.env` (CHANGE-00c)
