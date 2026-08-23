## Purpose

Define the canonical contract for error responses in the FastAPI Bridge, codifying RFC 7807 (Problem Details for HTTP APIs) as the single error format for all domains (Auth and Scan), with a model independent of the web framework.
## Requirements
### Requirement: Forma canónica del error RFC 7807
El FastAPI Bridge SHALL definir un único modelo Pydantic v2 `ErrorDetail` que fija la forma de todo error de la API, codificando RN-WS-09 (Problem Details for HTTP APIs). El modelo SHALL declarar exactamente los cinco miembros `type`, `title`, `status`, `detail` e `instance`, con type hints explícitos. Ningún dominio SHALL definir su propia forma de error: Auth y Scan comparten esta.

El miembro `detail` SHALL admitir ausencia de valor: RFC 7807 declara los cinco miembros opcionales, y el constructor de respuestas de error ya admite emitir un error sin detalle. Exigirlo obligado forzaría a los manejadores a inventar un texto donde el código de estado y el título ya dicen todo.

`ErrorDetail` SHALL ser además el constructor **efectivo** del cuerpo que sale por el cable, no una declaración paralela a él: el constructor único de respuestas de error SHALL armar el cuerpo a través del modelo. Declarar la misma forma dos veces —una en el modelo y otra en un diccionario literal dentro del manejador— permite que ambas diverjan sin que nada lo detecte, y deja las restricciones del modelo (como el rango válido de `status`) sin efecto sobre lo que el servicio realmente emite.

#### Scenario: Error válido
- **WHEN** se construye `ErrorDetail` con un título, un estado dentro del rango HTTP, un detalle y una instancia
- **THEN** el modelo se construye sin error

#### Scenario: Los miembros del modelo son los de RFC 7807
- **WHEN** se inspeccionan los campos de `ErrorDetail`
- **THEN** son exactamente `type`, `title`, `status`, `detail` e `instance`

#### Scenario: Tipo de problema por defecto
- **WHEN** se construye `ErrorDetail` sin pasar `type`
- **THEN** `type` vale `"about:blank"`, el valor que RFC 7807 prescribe cuando el error no tiene un tipo de problema propio

#### Scenario: Detalle ausente
- **WHEN** se construye `ErrorDetail` sin pasar `detail`
- **THEN** el modelo se construye sin error y `detail` queda sin valor, tal como RFC 7807 admite

#### Scenario: Un único contrato de error para los dos dominios
- **WHEN** se busca en el código de producción una segunda definición de la forma de error de la API
- **THEN** no existe: `ErrorDetail` es el único modelo que la declara, y tanto los errores de auth como los de scan lo usan

#### Scenario: El cuerpo emitido se construye a través del modelo
- **WHEN** se inspecciona cómo el constructor único de respuestas de error arma el cuerpo que serializa
- **THEN** lo construye instanciando `ErrorDetail` y volcando su contenido, y no ensamblando un diccionario con las cinco claves en paralelo al modelo

#### Scenario: Las restricciones del modelo alcanzan a lo que se emite
- **WHEN** un manejador intenta construir una respuesta de error con un `status` fuera del rango HTTP válido
- **THEN** la construcción falla en lugar de emitirse, porque el cuerpo pasa por las validaciones del modelo antes de serializarse

### Requirement: El contrato de error vive en un módulo propio, no en el de un dominio
`ErrorDetail` SHALL declararse en `fastapi_bridge/schemas/error_schemas.py`, un módulo dedicado al contrato de error, y NO SHALL declararse dentro del módulo de schemas de un dominio concreto. El contrato de error es transversal — lo consumen los manejadores globales de excepciones y todos los dominios —, y alojarlo en el módulo de un dominio obligaría a los demás consumidores a importar de un dominio ajeno para hablar de errores que no le pertenecen.

#### Scenario: Ubicación del contrato de error
- **WHEN** se busca la definición de `ErrorDetail` en el árbol de `fastapi_bridge/schemas/`
- **THEN** está en `error_schemas.py` y no en el módulo de schemas de ningún dominio

#### Scenario: El módulo de schemas de scan no declara el contrato de error
- **WHEN** se inspecciona `fastapi_bridge/schemas/scan_schemas.py`
- **THEN** no define `ErrorDetail`: ese módulo queda reservado para los contratos propios del dominio scan

#### Scenario: Los consumidores importan el contrato desde el módulo transversal
- **WHEN** un consumidor del contrato de error —el dominio auth o los manejadores globales de excepciones— necesita `ErrorDetail`
- **THEN** lo importa desde el módulo dedicado al contrato de error, sin depender de ningún módulo de dominio

### Requirement: El estado del error está acotado al rango HTTP
`ErrorDetail.status` SHALL ser un entero dentro del rango de códigos de estado HTTP (100 a 599 inclusive). Un valor fuera de ese rango es siempre un defecto del handler que construyó el error, y el contrato SHALL hacerlo visible en lugar de emitirlo hacia el cliente.

#### Scenario: Estado dentro del rango
- **WHEN** se construye `ErrorDetail` con un `status` de 400, 401, 409, 422, 429, 502 o 500
- **THEN** el modelo se construye sin error, cubriendo todos los estados que los handlers globales deben producir

#### Scenario: Estado por debajo del rango
- **WHEN** se construye `ErrorDetail` con un `status` menor a 100
- **THEN** la construcción falla con un error de validación

#### Scenario: Estado por encima del rango
- **WHEN** se construye `ErrorDetail` con un `status` mayor a 599
- **THEN** la construcción falla con un error de validación

### Requirement: `type` e `instance` admiten referencias URI relativas
`ErrorDetail.type` e `ErrorDetail.instance` SHALL modelarse como texto y NO SHALL exigir una URL absoluta. RFC 7807 define ambos miembros como *URI references*, que incluyen referencias relativas; en la práctica `instance` es el path del endpoint que falló, y exigir un esquema y un host obligaría a cada handler a inventar un origen absoluto que no conoce.

#### Scenario: `instance` como path del endpoint que falló
- **WHEN** se construye `ErrorDetail` con `instance` igual al path relativo del endpoint que produjo el error, por ejemplo el del login
- **THEN** el modelo se construye sin error

#### Scenario: `type` como URI absoluta de un tipo de problema propio
- **WHEN** se construye `ErrorDetail` con un `type` que es una URI absoluta que documenta el tipo de problema
- **THEN** el modelo se construye sin error: ambas formas de referencia URI son admisibles

### Requirement: El contrato de error es independiente del framework
El módulo que declara `ErrorDetail` (`fastapi_bridge/schemas/error_schemas.py`) NO SHALL importar FastAPI ni ningún componente de la capa web. La forma del error se define en la capa de schemas; los `exception_handler` que la producen y la serializan pertenecen a `fastapi_bridge/exceptions/handlers.py`, que importa el contrato pero no al revés.

#### Scenario: Sin dependencia del framework web
- **WHEN** se analizan los imports del módulo que declara `ErrorDetail`
- **THEN** no importa `fastapi`

#### Scenario: La emisión del error está fuera de este contrato
- **WHEN** se inspecciona el módulo que declara `ErrorDetail`
- **THEN** no registra ningún manejador de excepciones ni construye ninguna respuesta HTTP: solo declara la forma del cuerpo del error

#### Scenario: La dependencia apunta de la capa web al contrato
- **WHEN** se analiza la dirección de la dependencia entre el módulo de manejadores y el del contrato
- **THEN** el módulo de manejadores importa `ErrorDetail`, y el módulo del contrato no importa nada del módulo de manejadores

