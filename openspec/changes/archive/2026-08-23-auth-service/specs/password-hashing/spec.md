## ADDED Requirements

### Requirement: Derivación de hash de contraseña con bcrypt
El servicio SHALL exponer una operación de hashing de contraseñas en `fastapi_bridge/core/security.py` que recibe la contraseña en texto plano y devuelve su hash bcrypt en formato modular (el string autodescriptivo que empieza por `$2b$` y lleva embebido el algoritmo, el coste y la sal). La operación NO SHALL persistir, registrar ni devolver la contraseña original, y NO SHALL exponer ningún parámetro que permita a un llamador debilitar el algoritmo desde fuera del módulo (RN-WS-12).

#### Scenario: El hash tiene el formato bcrypt esperado
- **WHEN** se hashea una contraseña cualquiera
- **THEN** el resultado es un string que empieza por `$2b$`, del que puede leerse el coste aplicado

#### Scenario: Dos hashes de la misma contraseña son distintos
- **WHEN** se hashea dos veces la misma contraseña
- **THEN** los dos resultados difieren, porque cada uno lleva su propia sal aleatoria — y ambos verifican correctamente contra esa contraseña

#### Scenario: La contraseña original no aparece en el resultado
- **WHEN** se hashea una contraseña
- **THEN** el texto plano no está contenido en el hash devuelto en ninguna forma recuperable

#### Scenario: El coste no es un parámetro del llamador
- **WHEN** se inspecciona la firma de la operación de hashing
- **THEN** recibe únicamente la contraseña: el coste es una constante del módulo, de modo que ningún llamador pueda emitir un hash más débil que el resto

### Requirement: El coste de bcrypt es una constante del módulo, no configuración de entorno
El coste (número de rondas) del algoritmo SHALL declararse como constante en el módulo de seguridad y SHALL valer 12, conforme a `knowledge-base/08_arquitectura_propuesta.md` §Seguridad. NO SHALL leerse de una variable de entorno: el coste queda embebido en el propio hash y bajarlo desde la configuración degradaría en silencio la seguridad de todos los usuarios nuevos sin dejar rastro en el repositorio.

#### Scenario: El coste aplicado es el declarado
- **WHEN** se inspecciona el hash producido por la operación de hashing
- **THEN** el coste embebido en el string es 12

#### Scenario: El coste no proviene de la configuración
- **WHEN** se inspecciona el módulo de seguridad y el contrato de variables de entorno
- **THEN** el coste no figura como variable de entorno ni se lee de la configuración del servicio

### Requirement: Verificación de contraseña contra un hash almacenado
El servicio SHALL exponer una operación de verificación que recibe una contraseña en texto plano y un hash almacenado, y devuelve verdadero solo si la contraseña corresponde a ese hash. La verificación SHALL delegarse en la primitiva de comparación de la librería de bcrypt, que compara en tiempo constante respecto del contenido; NO SHALL implementarse volviendo a hashear y comparando strings con el operador de igualdad.

#### Scenario: Contraseña correcta
- **WHEN** se verifica una contraseña contra el hash derivado de esa misma contraseña
- **THEN** el resultado es verdadero

#### Scenario: Contraseña incorrecta
- **WHEN** se verifica una contraseña distinta contra el hash
- **THEN** el resultado es falso

#### Scenario: La verificación distingue mayúsculas y espacios
- **WHEN** se verifica una contraseña que difiere de la original solo en capitalización o en un espacio al final
- **THEN** el resultado es falso: la contraseña no se normaliza, a diferencia del email

#### Scenario: La comparación no se hace con igualdad de strings
- **WHEN** se inspecciona la implementación de la verificación
- **THEN** usa la primitiva de comparación de la librería de bcrypt y no compara hashes con el operador de igualdad de strings

### Requirement: Un hash corrupto se rechaza, no rompe el servicio
Cuando el hash almacenado esté malformado, vacío o no sea un hash bcrypt válido, la operación de verificación SHALL devolver falso en lugar de propagar la excepción de la librería subyacente. Un registro corrupto en la base debe producir un inicio de sesión fallido, nunca un error interno del servicio.

#### Scenario: Hash malformado
- **WHEN** se verifica una contraseña contra un valor que no es un hash bcrypt válido
- **THEN** el resultado es falso y no se propaga ninguna excepción

#### Scenario: Hash vacío
- **WHEN** se verifica una contraseña contra un hash vacío
- **THEN** el resultado es falso y no se propaga ninguna excepción

### Requirement: El hashing no bloquea el hilo que atiende las peticiones
Las primitivas de hashing y verificación SHALL declararse como funciones síncronas, porque son trabajo de CPU y no de entrada/salida. Todo llamador asíncrono SHALL ejecutarlas fuera del hilo del bucle de eventos. Ejecutarlas dentro del bucle haría que cada registro o inicio de sesión detuviera durante cientos de milisegundos la atención de todas las demás peticiones, incluida la de salud.

#### Scenario: Las primitivas son síncronas
- **WHEN** se inspeccionan las operaciones de hashing y verificación
- **THEN** son funciones síncronas: no son corrutinas, y pueden invocarse desde un test sin bucle de eventos

#### Scenario: La capa de servicio las ejecuta fuera del bucle de eventos
- **WHEN** se inspecciona cómo la capa de servicio invoca el hashing y la verificación
- **THEN** las ejecuta a través del mecanismo de descarga a hilo del runtime asíncrono, y no las llama directamente dentro de la corrutina

#### Scenario: La descarga a hilo está anclada por un test
- **WHEN** un change futuro reemplace la descarga a hilo por una llamada directa dentro de la corrutina
- **THEN** la suite de tests falla, aunque el comportamiento funcional siga siendo correcto

### Requirement: La librería de hashing está aislada en el módulo de seguridad
Únicamente `fastapi_bridge/core/security.py` SHALL importar la librería de hashing de contraseñas. Ningún módulo bajo `services/`, `repositories/`, `api/` o `schemas/` SHALL importarla: la capa de servicio hashea a través del módulo de seguridad, y la capa de persistencia trata el hash como texto opaco (RN-WS-12). Esta restricción SHALL estar verificada por un test automático sobre los imports, no solamente documentada.

#### Scenario: La capa de servicio no importa la librería de hashing
- **WHEN** se inspeccionan los imports de todos los módulos de `services/`
- **THEN** ninguno importa la librería de hashing: el acceso pasa por el módulo de seguridad

#### Scenario: La capa de persistencia no importa la librería de hashing
- **WHEN** se inspeccionan los imports de todos los módulos de `repositories/`
- **THEN** ninguno importa la librería de hashing, cualquiera sea la librería que el proyecto declare en su manifiesto de dependencias

#### Scenario: La restricción está anclada por un test
- **WHEN** un change futuro agregue a `services/` o a `repositories/` un import directo de la librería de hashing
- **THEN** la suite de tests falla, señalando el archivo y el paquete prohibido
