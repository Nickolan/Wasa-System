## Purpose

Contrato de emisión y decodificación de JSON Web Tokens de acceso: firma HS256 con la clave de `Settings.JWT_SECRET`, expiración derivada de `Settings.TOKEN_EXPIRE_HOURS`, y decodificación que nunca propaga excepciones ni revela el motivo del rechazo.

## Requirements

### Requirement: Emisión de un JWT firmado con la clave de la configuración
El servicio SHALL exponer en `fastapi_bridge/core/security.py` una operación que emite un JSON Web Token firmado con HS256, a partir de un conjunto de claims y de una duración. La clave de firma SHALL provenir exclusivamente de `Settings.JWT_SECRET` y SHALL llegar a la operación por parámetro, nunca leída de un global ni hardcodeada. El token emitido SHALL incluir la marca de vencimiento y la marca de emisión además de los claims recibidos.

#### Scenario: El token emitido es un JWT de tres segmentos
- **WHEN** se emite un token con una identidad y una duración
- **THEN** el resultado es un string con tres segmentos separados por puntos, decodificable con la misma clave

#### Scenario: Los claims recibidos viajan en el token
- **WHEN** se emite un token cuyo sujeto es un email determinado
- **THEN** al decodificarlo con la clave correcta se recupera ese mismo email como sujeto

#### Scenario: El token lleva vencimiento y marca de emisión
- **WHEN** se inspecciona el contenido de un token recién emitido
- **THEN** contiene tanto la marca de vencimiento como la marca de emisión, ambas derivadas del instante de emisión y de la duración recibida

#### Scenario: La clave llega por parámetro
- **WHEN** se inspecciona la firma de la operación de emisión
- **THEN** recibe la configuración del servicio como argumento explícito, de modo que un test pueda emitir con una clave propia sin alterar la configuración global del proceso

#### Scenario: La clave nunca se hardcodea
- **WHEN** se inspecciona el módulo de seguridad
- **THEN** no contiene ningún valor literal usado como clave de firma: la única fuente es la configuración

### Requirement: El algoritmo de firma es una constante del módulo
El algoritmo SHALL ser HS256 y SHALL declararse como constante en el módulo de seguridad, conforme a `knowledge-base/08_arquitectura_propuesta.md` §Seguridad. NO SHALL ser configurable por entorno ni un parámetro del llamador: es una propiedad del diseño criptográfico del servicio, no de su despliegue.

#### Scenario: Se firma con HS256
- **WHEN** se inspecciona la cabecera de un token emitido por el servicio
- **THEN** declara HS256 como algoritmo

#### Scenario: El algoritmo no es un parámetro
- **WHEN** se inspeccionan las firmas de las operaciones de emisión y de decodificación
- **THEN** ninguna recibe el algoritmo como argumento, y el algoritmo no figura en el contrato de variables de entorno

### Requirement: La expiración del token proviene de la configuración
La duración del token SHALL derivarse de `Settings.TOKEN_EXPIRE_HOURS` (default 24 horas), de modo que acortar o alargar la vida de las sesiones sea un cambio de configuración y no de código (RN-WS-14). La duración SHALL llegar a la operación de emisión como una duración explícita, y el mismo valor SHALL ser el que se informe al cliente en la respuesta de token.

#### Scenario: La vida del token sigue a la configuración
- **WHEN** se emite un token con la configuración por defecto
- **THEN** su vencimiento cae aproximadamente 24 horas después de su emisión

#### Scenario: Cambiar la configuración cambia la vida del token
- **WHEN** se emite un token con una configuración cuya duración es distinta de la de por defecto
- **THEN** el vencimiento del token refleja esa duración, sin haber tocado el código

#### Scenario: La duración informada y la real son el mismo valor
- **WHEN** se emite un token y se compara su vencimiento con la duración informada al cliente
- **THEN** ambos derivan del mismo valor de configuración, de modo que el cliente no pueda considerar vigente un token ya vencido ni descartar uno que todavía sirve

### Requirement: La decodificación valida firma, algoritmo y vencimiento
La operación de decodificación SHALL verificar la firma con la clave de la configuración, SHALL aceptar únicamente el algoritmo declarado por el servicio pasándolo como lista explícita de algoritmos permitidos, y SHALL rechazar los tokens vencidos. La lista de algoritmos permitidos NUNCA SHALL derivarse de la cabecera del token que se está validando: aceptar el algoritmo que el propio token declara permite a un atacante presentar un token sin firma, o firmado con un algoritmo distinto, y ser autenticado como cualquier identidad que escriba en el sujeto.

#### Scenario: Token válido
- **WHEN** se decodifica un token vigente emitido con la clave correcta
- **THEN** se recupera la identidad que lleva en el sujeto

#### Scenario: Token firmado con otra clave
- **WHEN** se decodifica un token firmado con una clave distinta de la de la configuración
- **THEN** se rechaza: la identidad recuperada queda vacía

#### Scenario: Token sin firma
- **WHEN** se decodifica un token cuya cabecera declara que no lleva algoritmo de firma
- **THEN** se rechaza: la identidad recuperada queda vacía, y en ningún caso se toma el algoritmo de la cabecera del token

#### Scenario: Token con un algoritmo no permitido
- **WHEN** se decodifica un token cuya cabecera declara un algoritmo distinto del que usa el servicio
- **THEN** se rechaza: la identidad recuperada queda vacía

#### Scenario: Token vencido
- **WHEN** se decodifica un token cuya marca de vencimiento ya pasó
- **THEN** se rechaza: la identidad recuperada queda vacía

#### Scenario: Token manipulado
- **WHEN** se altera cualquier carácter del segmento de contenido de un token válido y se lo decodifica
- **THEN** se rechaza: la identidad recuperada queda vacía

### Requirement: La decodificación devuelve una identidad vacía, nunca una excepción
Ante cualquier token inválido —firma incorrecta, algoritmo no permitido, vencido, malformado, o sin sujeto— la operación de decodificación SHALL devolver el contrato de payload decodificado con la identidad vacía, y NO SHALL propagar la excepción de la librería de JWT. Un token que no sirve es un fallo de autenticación, que su consumidor resolverá con un 401; propagarlo como excepción abriría la puerta a que se escape como error interno del servicio o como error de validación de request. El motivo del rechazo NO SHALL viajar hacia el llamador: distinguir "vencido" de "firma inválida" es información útil para un atacante.

#### Scenario: Token basura
- **WHEN** se decodifica un string que no tiene forma de JWT
- **THEN** se devuelve el contrato de payload con la identidad vacía, sin lanzar excepción

#### Scenario: Token sin sujeto
- **WHEN** se decodifica un token válidamente firmado y vigente que no incluye el claim de sujeto
- **THEN** se devuelve el contrato de payload con la identidad vacía, sin lanzar excepción

#### Scenario: Todos los rechazos son indistinguibles entre sí
- **WHEN** se comparan los resultados de decodificar un token vencido, uno firmado con otra clave y uno malformado
- **THEN** los tres resultados son iguales: la identidad vacía, sin ningún dato que permita saber por cuál de los tres motivos se rechazó

#### Scenario: El tipo devuelto es siempre el mismo
- **WHEN** se decodifica cualquier token, válido o inválido
- **THEN** el valor devuelto es siempre el contrato de payload de JWT decodificado, de modo que el llamador nunca tenga que ramificar por tipo de retorno

### Requirement: El secreto de firma nunca se registra ni se expone
`Settings.JWT_SECRET` SHALL manejarse siempre como valor secreto: NO SHALL escribirse en logs, NO SHALL incluirse en mensajes de excepción y NO SHALL aparecer en ninguna respuesta del servicio. Los tokens emitidos tampoco SHALL registrarse en logs.

#### Scenario: Sin registro del secreto
- **WHEN** se inspecciona el módulo de seguridad
- **THEN** ninguna sentencia de registro ni ningún mensaje de excepción incluye la clave de firma

#### Scenario: Sin registro de tokens
- **WHEN** se inspecciona el módulo de seguridad
- **THEN** ninguna sentencia de registro incluye el token emitido ni el token recibido para decodificar

#### Scenario: El secreto no se desenvuelve fuera del módulo de seguridad
- **WHEN** se inspecciona el código de producción fuera de `core/security.py`
- **THEN** ningún módulo extrae el valor en claro de la clave de firma: el único que la desenvuelve es el que firma y verifica
