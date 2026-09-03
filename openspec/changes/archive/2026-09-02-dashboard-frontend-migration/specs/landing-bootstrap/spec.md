## MODIFIED Requirements

### Requirement: Dependencias del stack frontend disponibles
El `package.json` SHALL declarar el stack completo que el roadmap consume en changes posteriores, en las versiones de la tabla de stack del proyecto, y cada dependencia SHALL ser importable sin error.

La librería de gráficos que la pantalla de resultados necesita SHALL formar parte de ese manifiesto como dependencia de runtime: la visualización de la distribución por severidad y de la evolución histórica (`dashboard-screen`) es funcionalidad de producción, no herramienta de desarrollo ni de pruebas.

#### Scenario: Manifiesto completo
- **WHEN** se inspeccionan las dependencias de runtime de `package.json`
- **THEN** figuran `react`, `react-dom`, `react-hook-form`, `zod`, `@hookform/resolvers`, `axios`, `zustand` y `recharts`

#### Scenario: Zustand importable
- **WHEN** se importa `create` desde `zustand`
- **THEN** el import resuelve y expone una función, sin error de módulo ni de tipos

#### Scenario: La librería de gráficos es importable y tipada
- **WHEN** se importa la librería de gráficos desde el código de la aplicación
- **THEN** el import resuelve y la verificación de tipos del proyecto termina sin errores, sin necesidad de un paquete de tipos aparte

#### Scenario: Runner de tests operativo
- **WHEN** se ejecuta el comando de tests del proyecto
- **THEN** el runner arranca, descubre la suite y reporta resultados sin errores de configuración
