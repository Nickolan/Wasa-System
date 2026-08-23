## Purpose

Decidir en el cliente, sin verificar la firma y sin consultar a ningún servidor, si un JWT sigue temporalmente vigente o ya venció, con una regla de falla cerrada para todo token que no se pueda leer con confianza. Es el veredicto sobre el que se apoya la restauración de sesión al arrancar la aplicación (RN-WS-14).

## Requirements

### Requirement: Un token con expiración futura se reporta como vigente

La inspección SHALL reportar como **no vencido** todo token cuyo claim `exp` designe un instante posterior al instante actual, sin importar el contenido del resto del payload ni de qué emisor provenga.

#### Scenario: Expiración dentro de las próximas 24 horas

- **WHEN** se inspecciona un token cuyo claim `exp` corresponde a un instante 24 horas en el futuro
- **THEN** el veredicto es "no vencido"

#### Scenario: Expiración a un segundo de distancia

- **WHEN** se inspecciona un token cuyo claim `exp` corresponde a un instante un segundo en el futuro
- **THEN** el veredicto es "no vencido"

#### Scenario: El resto del payload es irrelevante para el veredicto

- **WHEN** se inspeccionan dos tokens con el mismo `exp` futuro pero payloads distintos en todos los demás claims (`sub`, `iat`, claims adicionales desconocidos)
- **THEN** ambos reciben el mismo veredicto "no vencido"

### Requirement: Un token cuyo instante de expiración ya pasó se reporta como vencido

La inspección SHALL reportar como **vencido** todo token cuyo claim `exp` designe un instante anterior o igual al instante actual. El límite SHALL ser cerrado: alcanzado el instante de expiración, el token ya está vencido.

#### Scenario: Expiración en el pasado

- **WHEN** se inspecciona un token cuyo claim `exp` corresponde a un instante una hora en el pasado
- **THEN** el veredicto es "vencido"

#### Scenario: Expiración exactamente en el instante actual

- **WHEN** se inspecciona un token cuyo claim `exp` coincide con el segundo actual del reloj
- **THEN** el veredicto es "vencido", no "vigente"

#### Scenario: El veredicto sigue al reloj

- **WHEN** un mismo token se inspecciona antes y después de que el reloj avance más allá de su `exp`
- **THEN** el primer veredicto es "no vencido" y el segundo es "vencido", sin que el token haya cambiado

### Requirement: Todo token que no se pueda leer con confianza se reporta como vencido

La inspección SHALL fallar cerrada: ante cualquier entrada de la que no se pueda extraer un instante de expiración inequívoco, el veredicto SHALL ser **vencido**. Esto incluye, sin limitarse a: la cadena vacía, una cadena que no tenga la forma de tres segmentos separados por puntos, un payload que no sea decodificable, un payload decodificable que no sea JSON válido, un payload JSON sin claim `exp`, y un claim `exp` que no sea un número. En ninguno de estos casos la inspección SHALL propagar un error a quien la invoca.

#### Scenario: Cadena vacía

- **WHEN** se inspecciona la cadena vacía
- **THEN** el veredicto es "vencido" y no se propaga ningún error

#### Scenario: Cadena sin la forma de un JWT

- **WHEN** se inspecciona una cadena arbitraria que no está compuesta por tres segmentos separados por puntos (por ejemplo `"no-soy-un-token"`)
- **THEN** el veredicto es "vencido" y no se propaga ningún error

#### Scenario: Payload no decodificable

- **WHEN** se inspecciona un token con tres segmentos cuyo segmento central contiene caracteres que no pertenecen al alfabeto de codificación
- **THEN** el veredicto es "vencido" y no se propaga ningún error

#### Scenario: Payload decodificable pero no es JSON

- **WHEN** se inspecciona un token cuyo segmento central decodifica a texto que no es JSON válido
- **THEN** el veredicto es "vencido" y no se propaga ningún error

#### Scenario: Payload JSON sin claim de expiración

- **WHEN** se inspecciona un token cuyo payload es JSON válido pero no contiene el claim `exp`
- **THEN** el veredicto es "vencido" y no se propaga ningún error

#### Scenario: Claim de expiración no numérico

- **WHEN** se inspecciona un token cuyo claim `exp` es una cadena, `null` o un objeto en vez de un número
- **THEN** el veredicto es "vencido" y no se propaga ningún error

### Requirement: El payload se interpreta con la codificación propia de los JWT

La inspección SHALL decodificar el segmento de payload como **base64url** —alfabeto con `-` y `_` en lugar de `+` y `/`, y relleno final opcional—, de modo que un token legítimo emitido por el Bridge nunca sea juzgado vencido por un problema de decodificación.

#### Scenario: Payload con caracteres propios de base64url

- **WHEN** se inspecciona un token cuyo segmento de payload contiene los caracteres `-` y `_` y cuyo `exp` es futuro
- **THEN** el veredicto es "no vencido": el payload se decodifica correctamente en vez de tratarse como ilegible

#### Scenario: Payload sin relleno final

- **WHEN** se inspecciona un token cuyo segmento de payload tiene una longitud que no es múltiplo de cuatro y carece de relleno, y cuyo `exp` es futuro
- **THEN** el veredicto es "no vencido"

### Requirement: El veredicto no depende de la firma ni de la red

La inspección SHALL basarse exclusivamente en el claim `exp` del payload y en el reloj local. NO SHALL verificar la firma del token, NO SHALL emitir ninguna petición de red y NO SHALL requerir ningún secreto. La autoridad sobre la validez criptográfica del token permanece en el FastAPI Bridge; este veredicto es únicamente sobre vigencia temporal.

#### Scenario: Firma inválida con expiración futura

- **WHEN** se inspecciona un token cuyo tercer segmento (la firma) es una cadena arbitraria que no corresponde a ninguna firma válida, pero cuyo `exp` es futuro
- **THEN** el veredicto es "no vencido": la inspección no pretende autenticar el token

#### Scenario: Sin tráfico de red

- **WHEN** se inspecciona cualquier token
- **THEN** no se emite ninguna petición de red durante la inspección

### Requirement: La inspección es una función pura y sin efectos

La inspección SHALL ser una función pura: dado el mismo token y el mismo instante de reloj SHALL producir siempre el mismo veredicto, y NO SHALL leer ni escribir estado de la aplicación, del almacenamiento del navegador ni de ninguna otra fuente externa.

#### Scenario: Repetición sin efectos observables

- **WHEN** se inspecciona el mismo token varias veces consecutivas con el reloj detenido
- **THEN** el veredicto es idéntico en todas las invocaciones y el almacenamiento del navegador queda exactamente como estaba

#### Scenario: La inspección no conoce el dominio de la aplicación

- **WHEN** se inspeccionan los imports del módulo que provee la inspección
- **THEN** no aparece ningún import de las capas `app`, `pages`, `widgets`, `features` ni `entities`, ni ninguna referencia a la sesión, al almacenamiento o a la configuración de la aplicación
