## MODIFIED Requirements

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
