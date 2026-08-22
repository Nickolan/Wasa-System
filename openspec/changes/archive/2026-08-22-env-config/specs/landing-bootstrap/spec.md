## MODIFIED Requirements

### Requirement: El scaffold no implementa funcionalidad de dominio
El change SHALL limitarse a la estructura. Ninguna regla de negocio, store, schema de validación, componente de UI reutilizable ni cliente HTTP SHALL implementarse en este estadio; cada uno pertenece a su change declarado en el roadmap.

#### Scenario: Sin authStore
- **WHEN** se inspecciona `src/app/stores/`
- **THEN** no existe `authStore.ts` (pertenece a CHANGE-13) y el directorio queda vacío, marcado únicamente con un `.gitkeep` anotado (D-10)

#### Scenario: Sin schemas ni componentes de dominio
- **WHEN** se inspeccionan `src/entities/`, `src/shared/ui/` y `src/features/`
- **THEN** no existen schemas Zod, ni los átomos `Button`/`Input`/`Checkbox`/`Spinner`/`Modal`, ni features de auth o de scan (pertenecen a CHANGE-14 a CHANGE-18)

#### Scenario: Sin cliente HTTP configurado
- **WHEN** se inspecciona `src/shared/api/`
- **THEN** no existe una instancia de Axios con interceptor Bearer (pertenece a CHANGE-16) y el directorio queda vacío, marcado únicamente con un `.gitkeep` anotado
