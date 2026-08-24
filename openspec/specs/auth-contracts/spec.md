## Purpose

Contratos Pydantic v2 de entrada y salida del dominio auth (`UserRegister`, `UserLogin`, `TokenResponse`, `TokenData`), independientes del framework web y de la capa de persistencia.

## Requirements

### Requirement: Contrato de registro de usuario
El FastAPI Bridge SHALL definir el contrato de entrada del registro como un modelo Pydantic v2 `UserRegister` en `fastapi_bridge/schemas/auth_schemas.py`, con exactamente dos campos: `email` y `password`. El modelo SHALL validar sintácticamente el email en la frontera, antes de que ningún dato alcance la capa de persistencia, y SHALL declarar type hints explícitos en cada campo.

#### Scenario: Payload de registro válido
- **WHEN** se construye `UserRegister` con un email sintácticamente válido y una contraseña de 8 caracteres o más
- **THEN** el modelo se construye sin error y expone el email y la contraseña recibidos

#### Scenario: Email sintácticamente inválido
- **WHEN** se construye `UserRegister` con un valor de email sin arroba, sin dominio, o vacío
- **THEN** la construcción falla con un error de validación que identifica el campo `email`

#### Scenario: Campos obligatorios
- **WHEN** se construye `UserRegister` omitiendo `email`, omitiendo `password`, o ambos
- **THEN** la construcción falla con un error de validación por cada campo faltante

#### Scenario: El contrato no tiene más campos que los declarados
- **WHEN** se inspeccionan los campos de `UserRegister`
- **THEN** son exactamente `email` y `password`: el registro no acepta rol, identificador ni ninguna marca de privilegio provista por el cliente

### Requirement: Política de longitud de contraseña en el registro
`UserRegister.password` SHALL exigir un mínimo de 8 caracteres, codificando RN-WS-15 del lado del backend con independencia de cualquier validación equivalente en el frontend. Adicionalmente SHALL rechazar contraseñas cuya representación UTF-8 supere los 72 bytes, que es el límite duro del algoritmo bcrypt usado para el hashing en un change posterior.

#### Scenario: Contraseña por debajo del mínimo
- **WHEN** se construye `UserRegister` con una contraseña de 7 caracteres o menos
- **THEN** la construcción falla con un error de validación que identifica el campo `password`

#### Scenario: Contraseña exactamente en el mínimo
- **WHEN** se construye `UserRegister` con una contraseña de exactamente 8 caracteres
- **THEN** el modelo se construye sin error

#### Scenario: Contraseña que excede el límite de bcrypt
- **WHEN** se construye `UserRegister` con una contraseña cuya codificación UTF-8 supera los 72 bytes
- **THEN** la construcción falla con un error de validación, en lugar de aceptarla y hacer fallar el hashing más adelante

#### Scenario: El límite se mide en bytes, no en caracteres
- **WHEN** se construye `UserRegister` con una contraseña de menos de 72 caracteres cuya codificación UTF-8 supera los 72 bytes (por ejemplo, caracteres multibyte)
- **THEN** la construcción falla igualmente: el límite se evalúa sobre los bytes codificados

#### Scenario: Contraseña multibyte dentro del límite
- **WHEN** se construye `UserRegister` con una contraseña de caracteres multibyte cuya codificación UTF-8 no supera los 72 bytes
- **THEN** el modelo se construye sin error: no se rechazan caracteres no ASCII por sí mismos

#### Scenario: Sin reglas de complejidad
- **WHEN** se construye `UserRegister` con una contraseña de longitud válida compuesta únicamente por minúsculas
- **THEN** el modelo se construye sin error: la única política de contraseña es la de longitud, sin exigencia de mayúsculas, dígitos ni símbolos

### Requirement: Contrato de inicio de sesión
El Bridge SHALL definir el contrato de entrada del login como un modelo Pydantic v2 `UserLogin` con los campos `email` y `password`. `UserLogin` NO SHALL reasertar la política de longitud mínima del registro: SHALL aceptar cualquier contraseña no vacía dentro del límite de bytes de bcrypt.

#### Scenario: Payload de login válido
- **WHEN** se construye `UserLogin` con un email válido y una contraseña no vacía
- **THEN** el modelo se construye sin error

#### Scenario: Contraseña corta aceptada en el login
- **WHEN** se construye `UserLogin` con una contraseña de menos de 8 caracteres
- **THEN** el modelo se construye sin error, de modo que un usuario cuya contraseña fue registrada bajo una política anterior pueda seguir autenticándose, y de modo que la respuesta de credenciales inválidas sea el 401 genérico y no un error de validación que revele la política vigente

#### Scenario: Contraseña vacía rechazada
- **WHEN** se construye `UserLogin` con una contraseña de longitud cero
- **THEN** la construcción falla con un error de validación

#### Scenario: El login comparte el límite de bytes de bcrypt
- **WHEN** se construye `UserLogin` con una contraseña cuya codificación UTF-8 supera los 72 bytes
- **THEN** la construcción falla con un error de validación, en lugar de propagar el fallo al momento de verificar el hash

#### Scenario: Email inválido en el login
- **WHEN** se construye `UserLogin` con un email sintácticamente inválido
- **THEN** la construcción falla con un error de validación que identifica el campo `email`

### Requirement: Los contratos de entrada rechazan campos desconocidos
`UserRegister` y `UserLogin` SHALL rechazar cualquier campo no declarado en el payload recibido, fallando de forma cerrada. Un campo desconocido es un defecto del cliente o una sonda deliberada, y aceptarlo en silencio abre la puerta a que un cliente intente inyectar atributos que el modelo no contempla.

#### Scenario: Campo extra en el registro
- **WHEN** se construye `UserRegister` con un campo adicional no declarado
- **THEN** la construcción falla con un error de validación que identifica el campo extra, en lugar de ignorarlo

#### Scenario: Campo extra en el login
- **WHEN** se construye `UserLogin` con un campo adicional no declarado
- **THEN** la construcción falla con un error de validación que identifica el campo extra

### Requirement: La contraseña en claro nunca aparece en una salida
Ningún modelo de respuesta definido en `fastapi_bridge/schemas/auth_schemas.py` SHALL contener un campo de contraseña, en claro ni hasheada, en cumplimiento de RN-WS-12. Los campos de contraseña de los modelos de entrada SHALL además quedar excluidos de la representación textual del modelo, de modo que registrar el objeto en un log o incluirlo en una traza de excepción no filtre la credencial. La contraseña SHALL modelarse como texto plano excluido de esa representación, y NO SHALL envolverse en un tipo de secreto que obligue a desenvolverla en cada punto de uso: la garantía de no filtración proviene de la exclusión de la representación y de la ausencia de contraseña en todo schema de salida.

#### Scenario: Ningún schema de salida expone contraseña
- **WHEN** se inspeccionan los campos de todos los modelos de respuesta del dominio auth
- **THEN** ninguno declara `password` ni `hashed_password`

#### Scenario: El registro no devuelve un eco del usuario creado
- **WHEN** se inspeccionan los modelos definidos en el dominio auth
- **THEN** no existe ningún modelo de respuesta que represente al usuario registrado: la respuesta del registro es la respuesta de token

#### Scenario: La contraseña no aparece en la representación del modelo
- **WHEN** se obtiene la representación textual de una instancia de `UserRegister` o de `UserLogin`
- **THEN** el valor de la contraseña no aparece en ella

#### Scenario: La contraseña es texto plano, no un envoltorio de secreto
- **WHEN** se accede al campo `password` de una instancia de `UserRegister` o de `UserLogin`
- **THEN** se obtiene directamente el texto recibido, sin necesidad de desenvolverlo: el consumidor que hashea o verifica la credencial no necesita ningún paso de extracción adicional

### Requirement: Contrato de respuesta de token
El Bridge SHALL definir `TokenResponse` como la única forma de respuesta exitosa de registro y de login, con los campos `access_token`, `token_type` y `expires_in`. `token_type` SHALL estar restringido al valor literal `"bearer"` y SHALL tener ese valor por defecto. `expires_in` SHALL expresar la vigencia del token **en segundos** y SHALL ser estrictamente positivo.

#### Scenario: Respuesta de token válida
- **WHEN** se construye `TokenResponse` con un `access_token` y un `expires_in` positivo, sin pasar `token_type`
- **THEN** el modelo se construye sin error y `token_type` vale `"bearer"`

#### Scenario: `token_type` está restringido a un único valor
- **WHEN** se construye `TokenResponse` pasando un `token_type` distinto de `"bearer"`
- **THEN** la construcción falla con un error de validación

#### Scenario: La vigencia debe ser positiva
- **WHEN** se construye `TokenResponse` con un `expires_in` de cero o negativo
- **THEN** la construcción falla con un error de validación

#### Scenario: La unidad de la vigencia es el segundo
- **WHEN** se serializa un `TokenResponse` emitido para un token con la vigencia por defecto de 24 horas
- **THEN** `expires_in` vale 86400, no 24: el valor sigue la semántica del campo homónimo de la respuesta de token de OAuth 2.0

#### Scenario: El schema no lee configuración
- **WHEN** se inspeccionan los imports de `fastapi_bridge/schemas/auth_schemas.py`
- **THEN** no importa `Settings` ni ningún módulo de configuración: la conversión de la vigencia configurada a segundos es responsabilidad del Service que construye la respuesta

### Requirement: Contrato del payload del JWT decodificado
El Bridge SHALL definir `TokenData` como la representación tipada del payload de un JWT ya decodificado, con el campo `email` de tipo texto opcional y valor por defecto nulo. `TokenData` NO SHALL ser un modelo de HTTP: no se serializa hacia el cliente y no forma parte de ninguna respuesta.

#### Scenario: Payload sin email
- **WHEN** se construye `TokenData` sin pasar `email`
- **THEN** el modelo se construye sin error y `email` es nulo, de modo que un token sin la claim de sujeto se pueda representar y rechazar como fallo de autenticación en lugar de reventar al parsearse

#### Scenario: El email del token no se valida como email
- **WHEN** se construye `TokenData` con un valor de `email` que no es un email sintácticamente válido
- **THEN** el modelo se construye sin error: un sujeto malformado en un token es un fallo de autenticación a resolver por la dependencia que lo consume, no un error de validación de request

#### Scenario: Los claims estándar del JWT no rompen el modelo
- **WHEN** se construye `TokenData` a partir de un payload decodificado que incluye claims adicionales como `exp`, `iat` o `sub`
- **THEN** el modelo se construye sin error ignorando los claims no declarados, a diferencia de los contratos de entrada HTTP que los rechazan

### Requirement: Los schemas son independientes del framework y de la infraestructura
Los módulos de `fastapi_bridge/schemas/` NO SHALL importar FastAPI, SQLAlchemy ni httpx. Los schemas son la capa más reutilizada hacia arriba: cualquier dependencia de framework o de infraestructura declarada acá se propaga a todos los consumidores y anula la posibilidad de usarlos fuera de la aplicación web.

#### Scenario: Sin dependencia del framework web
- **WHEN** se analizan los imports de cada módulo de `fastapi_bridge/schemas/`
- **THEN** ninguno importa `fastapi`

#### Scenario: Sin dependencia de la capa de datos ni del cliente HTTP
- **WHEN** se analizan los imports de cada módulo de `fastapi_bridge/schemas/`
- **THEN** ninguno importa `sqlalchemy` ni `httpx`

#### Scenario: La frontera está verificada de forma automática
- **WHEN** se inspecciona la tabla de reglas de frontera entre capas de la suite de tests
- **THEN** contiene las reglas que prohíben esos imports en `schemas/`, de modo que una violación futura produzca un test rojo y no una revisión manual

### Requirement: Los contratos de auth no conocen la persistencia
Los schemas del dominio auth NO SHALL importar ni referenciar el modelo ORM `User` ni la factory de sesiones. El contrato de la frontera HTTP y el contrato de la tabla evolucionan por razones distintas, y acoplarlos haría que un cambio de columna se filtrara a la API pública.

#### Scenario: Sin acoplamiento al modelo ORM
- **WHEN** se analizan los imports de `fastapi_bridge/schemas/auth_schemas.py`
- **THEN** no importa `fastapi_bridge.db.models` ni `fastapi_bridge.db.session`

#### Scenario: El email del contrato no hereda los límites de la columna
- **WHEN** se comparan `UserRegister.email` y la columna `email` de la tabla `users`
- **THEN** la validación del schema es sintáctica y propia de la frontera: no replica ni depende del tipo de columna declarado en la base
