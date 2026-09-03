## Purpose

Define el **borde HTTP de la consulta de resultados de escaneo**: la operación por la que un cliente pide el estado consolidado de los escaneos y sus vulnerabilidades, qué método admite, quién puede invocarla, qué parámetros de filtrado acepta y cómo los valida, y qué recibe tanto cuando la consulta tiene éxito como cuando falla. `dashboard-projection` describe *qué datos* devuelve esa consulta y con qué semántica; esta capability describe *cómo se la pide por red y qué se responde*.

## Requirements

### Requirement: Existe una operación de consulta de resultados alcanzable por red

El servicio SHALL exponer una operación de consulta de resultados en `GET /api/v1/dashboard`, disponible en la aplicación de producción y no sólo en configuraciones de prueba. La operación SHALL SER la única del dominio dashboard expuesta por el servicio: no SHALL exponerse creación, modificación ni borrado de escaneos ni de vulnerabilidades bajo ese prefijo.

#### Scenario: La operación existe y no responde "no encontrado"

- **WHEN** se invoca `GET /api/v1/dashboard` sobre la aplicación de producción
- **THEN** la respuesta NO es `404`: la ruta está registrada en la superficie de API

#### Scenario: Sólo el verbo de lectura está admitido

- **WHEN** se invoca la ruta de consulta de resultados con un método distinto de `GET` (por ejemplo `POST`, `PUT` o `DELETE`)
- **THEN** la respuesta es `405`, no `200` ni `404`

#### Scenario: El dominio dashboard no expone ninguna otra operación

- **WHEN** se inspecciona la superficie de API del servicio bajo el prefijo del dominio dashboard
- **THEN** la única ruta registrada es la de consulta de resultados

### Requirement: La consulta de resultados es pública

La operación de consulta de resultados SHALL atenderse sin exigir credencial de acceso, replicando el comportamiento del backend de dashboard preexistente que reemplaza. Una solicitud sin cabecera de autorización SHALL responderse igual que una que la lleve: la operación SHALL NOT inspeccionar la cabecera de autorización, SHALL NOT rechazar por ausencia de credencial y SHALL NOT variar el conjunto de datos devuelto según quién consulte. En particular, los resultados NO SHALL filtrarse por el usuario que originó cada escaneo.

Esta apertura es un comportamiento **heredado** del sistema existente y una decisión explícita del propietario del producto, no una omisión: cerrar la operación es un cambio de producto que corresponde a un change propio, no a éste.

#### Scenario: Sin cabecera de autorización

- **WHEN** se invoca la consulta de resultados sin cabecera de autorización
- **THEN** la respuesta es `200` con el conjunto completo de resultados, nunca `401`

#### Scenario: Con una credencial inválida

- **WHEN** se invoca la consulta de resultados con una cabecera de autorización cuyo token es inexistente, malformado o expirado
- **THEN** la respuesta es `200` con el mismo conjunto de resultados que sin cabecera alguna: la credencial no participa de la resolución de la operación

#### Scenario: El conjunto de datos no depende del solicitante

- **WHEN** dos solicitantes distintos invocan la consulta de resultados con los mismos parámetros
- **THEN** ambos reciben exactamente el mismo conjunto de escaneos y de vulnerabilidades

### Requirement: La consulta de resultados no consume cupo de disparo de escaneos

La operación de consulta de resultados SHALL quedar fuera del límite de solicitudes por IP que rige el disparo de escaneos: invocarla repetidamente SHALL NOT agotar ese cupo ni SHALL rechazarse con `429` por haberlo agotado con otras operaciones. Es una operación de lectura que el frontend reinvoca ante cada cambio de filtro, y limitarla al ritmo de un disparo de escaneo la volvería inutilizable.

#### Scenario: Invocaciones repetidas dentro de la ventana

- **WHEN** una misma IP invoca la consulta de resultados muchas más veces que `RATE_LIMIT_REQUESTS` dentro de una ventana de `RATE_LIMIT_WINDOW` segundos
- **THEN** ninguna de esas respuestas es `429`

#### Scenario: El cupo de escaneos agotado no afecta a la consulta

- **WHEN** una IP agotó su cupo de disparo de escaneos y a continuación invoca la consulta de resultados
- **THEN** la respuesta es `200`, no `429`

### Requirement: Contrato de los parámetros de filtrado

La operación SHALL aceptar tres parámetros de consulta, todos opcionales: `scan_id`, `severity` y `source`. Ausentes u omitidos, la consulta SHALL comportarse como sin filtro. `scan_id` SHALL interpretarse como el identificador entero de un escaneo; un valor no convertible a entero SHALL rechazarse con `422` en el borde HTTP, sin alcanzar la base de datos. `severity` y `source` SHALL aceptarse como texto libre y SHALL tratarse siempre como datos, nunca como fragmento de consulta: un valor que contenga comillas, punto y coma o sintaxis SQL SHALL comportarse como un literal que no coincide con nada, jamás como instrucción ejecutable.

Ningún parámetro de consulta distinto de esos tres SHALL alterar el resultado: un parámetro desconocido SHALL ignorarse en silencio, sin error y sin efecto.

#### Scenario: Sin ningún parámetro

- **WHEN** se invoca la consulta de resultados sin parámetros de consulta
- **THEN** la respuesta es `200` y no se aplica ningún filtro

#### Scenario: Parámetro vacío equivale a ausente

- **WHEN** se invoca la consulta de resultados con `severity=` (valor vacío)
- **THEN** la respuesta es `200` y ese filtro no se aplica, igual que si el parámetro no se hubiera enviado

#### Scenario: Identificador de escaneo no numérico

- **WHEN** se invoca la consulta de resultados con `scan_id=abc`
- **THEN** la respuesta es `422` y ninguna consulta llega a ejecutarse contra la base de datos

#### Scenario: Valor de filtro con sintaxis SQL

- **WHEN** se invoca la consulta de resultados con `source=' OR 1=1 --`
- **THEN** la respuesta es `200` con cero vulnerabilidades (ninguna fila tiene esa fuente literal) y la base de datos no ejecuta ninguna instrucción adicional

#### Scenario: Parámetro desconocido

- **WHEN** se invoca la consulta de resultados con un parámetro que la operación no declara (por ejemplo `limit=5`)
- **THEN** la respuesta es `200` y es idéntica a la de la misma invocación sin ese parámetro

### Requirement: Respuesta exitosa y respuesta ante fallo

Una consulta atendida correctamente SHALL responderse con status `200` y un cuerpo JSON que contenga exactamente dos claves de primer nivel, `scans` y `vulnerabilities`, cada una con una lista —posiblemente vacía—. Una consulta que no puede resolverse porque la base de datos compartida está inaccesible o falla SHALL responderse con un error del servidor en el formato de problema RFC 7807 que rige para toda la API, y ese cuerpo SHALL NOT contener la cadena de conexión, credenciales, nombres de host ni el texto de la consulta SQL ejecutada.

#### Scenario: Cuerpo de una respuesta exitosa

- **WHEN** la consulta se resuelve correctamente
- **THEN** el status es `200` y el cuerpo tiene exactamente las claves `scans` y `vulnerabilities`, ambas listas

#### Scenario: Base sin datos

- **WHEN** la consulta se resuelve correctamente contra una base sin ningún escaneo registrado
- **THEN** el status es `200` y el cuerpo es `{"scans": [], "vulnerabilities": []}`, nunca `404` ni un cuerpo nulo

#### Scenario: Base de datos inaccesible

- **WHEN** la base de datos compartida no responde al resolverse la consulta
- **THEN** la respuesta es un error `5xx` con `Content-Type: application/problem+json` y los campos del contrato de errores del servicio, no un cuerpo `{"error": "..."}` propio de esta operación

#### Scenario: El error no filtra detalles de infraestructura

- **WHEN** se inspecciona el cuerpo del error devuelto ante un fallo de base de datos
- **THEN** no contiene la cadena de conexión, el usuario o contraseña de la base, el nombre del host ni el texto SQL de la consulta

### Requirement: La operación queda documentada en el esquema OpenAPI

La operación de consulta de resultados SHALL aparecer en el esquema OpenAPI que publica el servicio, con sus tres parámetros de consulta declarados como opcionales y con el esquema de su respuesta exitosa, de modo que un consumidor pueda descubrir el contrato sin leer el código.

#### Scenario: La ruta está en el esquema

- **WHEN** se obtiene el esquema OpenAPI del servicio
- **THEN** incluye la ruta de consulta de resultados con la operación `get`

#### Scenario: Los parámetros están declarados como opcionales

- **WHEN** se inspecciona esa operación en el esquema OpenAPI
- **THEN** declara los parámetros `scan_id`, `severity` y `source` en la ubicación `query`, ninguno de ellos requerido

#### Scenario: La operación no declara requisito de seguridad

- **WHEN** se inspecciona esa operación en el esquema OpenAPI
- **THEN** no declara ningún esquema de seguridad asociado: es coherente con que la operación sea pública
