## REMOVED Requirements

### Requirement: El scaffold no implementa funcionalidad de dominio

**Reason**: El requirement enumera el inventario de un estadio del proyecto —"todavía no hay nada de dominio en `src/`"— que este change termina para una de sus piezas. Su escenario "Sin authStore" afirma que `src/app/stores/authStore.ts` no existe y que el directorio queda vacío con sólo un `.gitkeep`, que es exactamente lo que este change construye y retira. Ni el nombre del requirement ni el de ese escenario pueden reescribirse sin mentir, y los nombres forman parte del contrato: por eso se retira en lugar de modificarse.

**Migration**: Sustituido por el requirement "Cada pieza de dominio aparece únicamente en el change que la implementa", que conserva íntegras las dos garantías todavía vigentes (sin schemas ni componentes de dominio; sin cliente HTTP configurado) y la anotación obligatoria de los `.gitkeep`, reformuladas como criterio duradero —una pieza de dominio existe si y sólo si su change ya ocurrió— en vez de como el inventario del estadio inicial. Ninguna garantía se pierde: la restricción sigue siendo que nada de dominio se adelanta a su change.

## ADDED Requirements

### Requirement: Cada pieza de dominio aparece únicamente en el change que la implementa

El árbol `wasa-landing/src/` SHALL contener funcionalidad de dominio si y sólo si el change que la implementa ya ocurrió. Un directorio de capa cuyo contenido todavía no fue implementado SHALL permanecer vacío, marcado únicamente con un `.gitkeep` anotado con el change que lo poblará (D-10); una vez implementado su contenido, ese `.gitkeep` SHALL retirarse. Ningún change SHALL adelantar código que el roadmap asignó a otro.

#### Scenario: El estado de sesión ya está implementado y acotado

- **WHEN** se inspecciona `src/app/stores/`
- **THEN** existe `authStore.ts` (CHANGE-13), ya no existe el `.gitkeep` que sostenía el directorio vacío, y no hay ningún otro store

#### Scenario: Sin schemas ni componentes de dominio

- **WHEN** se inspeccionan `src/entities/`, `src/shared/ui/` y `src/features/`
- **THEN** no existen schemas Zod, ni los átomos `Button`/`Input`/`Checkbox`/`Spinner`/`Modal`, ni features de auth o de scan (pertenecen a CHANGE-14 a CHANGE-18)

#### Scenario: Sin cliente HTTP configurado

- **WHEN** se inspecciona `src/shared/api/`
- **THEN** no existe una instancia de Axios con interceptor Bearer (pertenece a CHANGE-16) y el directorio queda vacío, marcado únicamente con un `.gitkeep` anotado

#### Scenario: Los directorios aún vacíos siguen marcados y anotados

- **WHEN** se inspecciona cada `.gitkeep` que queda bajo `src/`
- **THEN** cada uno contiene un comentario no vacío que nombra el change que poblará ese directorio
