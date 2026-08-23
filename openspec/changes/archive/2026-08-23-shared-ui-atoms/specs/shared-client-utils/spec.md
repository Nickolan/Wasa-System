## ADDED Requirements

### Requirement: Las utilidades compartidas son funciones puras sin dominio

El módulo `wasa-landing/src/shared/lib/utils.ts` SHALL exportar únicamente funciones puras, sin estado de módulo, sin acceso a `localStorage`, sin peticiones de red y sin conocimiento del dominio WASA. Ninguna de sus funciones SHALL importar de `@app`, `@pages`, `@widgets`, `@features` ni `@entities`.

#### Scenario: El módulo existe y exporta ambas utilidades

- **WHEN** se importa `@shared/lib/utils`
- **THEN** expone `cn` y `jwtIsExpired`, ambas funciones

#### Scenario: Sin efectos de módulo

- **WHEN** se importa el módulo en un entorno sin `window` ni `localStorage`
- **THEN** la importación no lanza ningún error

#### Scenario: Sin imports de capas superiores

- **WHEN** se inspeccionan los imports de `src/shared/lib/utils.ts`
- **THEN** solo aparecen paquetes externos, y ningún alias de otra capa FSD

### Requirement: `cn()` fusiona clases Tailwind resolviendo conflictos

`cn(...inputs)` SHALL aceptar la misma variedad de entradas que `clsx` (strings, arrays, objetos condicionales, `null`/`undefined`/`false`) y SHALL devolver un string de clases en el que, ante dos utilidades Tailwind del mismo grupo, prevalece la última. Esto permite que un consumidor sobreescriba las clases por defecto de un primitivo pasando su propia `className`, sin depender del orden de las reglas CSS.

#### Scenario: Concatenación simple

- **WHEN** se invoca `cn("px-4", "font-medium")`
- **THEN** el resultado contiene ambas clases

#### Scenario: Entradas condicionales

- **WHEN** se invoca `cn("px-4", false, null, undefined, { "text-red-500": true, "text-green-500": false })`
- **THEN** el resultado contiene `px-4` y `text-red-500`, y no contiene `text-green-500` ni los valores vacíos

#### Scenario: El último conflicto gana

- **WHEN** se invoca `cn("px-4", "px-8")`
- **THEN** el resultado es `px-8` y no contiene `px-4`

#### Scenario: Sin argumentos

- **WHEN** se invoca `cn()`
- **THEN** el resultado es un string vacío

### Requirement: `jwtIsExpired()` decide expiración leyendo el claim `exp`, con política fail-closed

`jwtIsExpired(token: string): boolean` SHALL decodificar el payload del JWT (base64url, sin librería adicional) y comparar su claim `exp` — expresado en segundos desde epoch, según RFC 7519 — contra la hora actual. SHALL devolver `true` cuando el token ya venció y `false` cuando sigue vigente. Ante cualquier token que no pueda inspeccionarse con confianza — cadena vacía, formato no-JWT, payload no decodificable, payload sin `exp` o con `exp` no numérico — SHALL devolver `true` (fail-closed: se trata como expirado). La función SHALL NOT verificar la firma del token: la validación criptográfica es autoridad exclusiva del FastAPI Bridge.

#### Scenario: Token vigente

- **WHEN** se invoca `jwtIsExpired` con un JWT cuyo `exp` está una hora en el futuro
- **THEN** devuelve `false`

#### Scenario: Token vencido

- **WHEN** se invoca `jwtIsExpired` con un JWT cuyo `exp` está una hora en el pasado
- **THEN** devuelve `true`

#### Scenario: `exp` se interpreta en segundos, no en milisegundos

- **WHEN** se invoca `jwtIsExpired` con un JWT cuyo `exp` es el timestamp en **segundos** de dentro de 60 segundos
- **THEN** devuelve `false` (no se lo confunde con un instante de 1970 por leerlo como milisegundos)

#### Scenario: Payload con caracteres base64url

- **WHEN** se invoca `jwtIsExpired` con un JWT cuyo payload codificado contiene los caracteres `-` o `_` propios de base64url y/o carece de padding `=`
- **THEN** la decodificación funciona y la respuesta refleja el `exp` real del payload

#### Scenario: Cadena vacía

- **WHEN** se invoca `jwtIsExpired("")`
- **THEN** devuelve `true`

#### Scenario: Formato no-JWT

- **WHEN** se invoca `jwtIsExpired` con un string sin tres segmentos separados por punto, o con un payload que no es base64 válido
- **THEN** devuelve `true` y no se propaga ninguna excepción al llamador

#### Scenario: Payload sin claim `exp`

- **WHEN** se invoca `jwtIsExpired` con un JWT bien formado cuyo payload no incluye `exp`, o cuyo `exp` no es un número
- **THEN** devuelve `true`

#### Scenario: No se verifica la firma

- **WHEN** se invoca `jwtIsExpired` con un JWT cuya firma es un valor arbitrario pero cuyo `exp` está en el futuro
- **THEN** devuelve `false` (la función no juzga autenticidad, solo vigencia)
