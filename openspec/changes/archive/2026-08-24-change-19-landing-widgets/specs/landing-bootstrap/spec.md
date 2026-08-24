## MODIFIED Requirements

### Requirement: Estructura de capas Feature-Sliced Design
El árbol `wasa-landing/src/` SHALL materializar en el filesystem las seis capas FSD definidas en `knowledge-base/08_arquitectura_propuesta.md`, de modo que cada change posterior tenga un destino inequívoco para su código.

La capa `widgets/` SHALL estar organizada en slices, una por sección de la Landing, y cada slice SHALL exponer su API pública en un único punto de entrada. Los consumidores de un widget SHALL importar desde ese punto de entrada y SHALL NOT alcanzar rutas internas de la slice.

La página de aterrizaje SHALL ser la composición de esas secciones, no un contenido de relleno: SHALL NOT quedar en el árbol ningún placeholder ni ningún formulario montado suelto fuera de la sección que le corresponde.

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

#### Scenario: La Landing es la composición de sus secciones
- **WHEN** se renderiza `src/pages/LandingPage/index.tsx`
- **THEN** el árbol resultante contiene las secciones de la Landing y ningún contenido de relleno

#### Scenario: La capa widgets está poblada y organizada en slices
- **WHEN** se inspecciona `src/widgets/`
- **THEN** contiene una slice por sección de la Landing, cada una con su punto de entrada público, y ya no contiene el `.gitkeep` que sostenía el directorio vacío

#### Scenario: Ningún formulario queda montado fuera de su sección
- **WHEN** se inspecciona `src/pages/LandingPage/index.tsx`
- **THEN** no monta directamente ningún formulario de dominio: cada formulario llega a la página a través de la sección que lo contiene
