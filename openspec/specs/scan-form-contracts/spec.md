## Purpose

Define el contrato del escaneo del lado del cliente: qué campos maneja el formulario de escaneo, qué valores se aceptan antes de llamar al Bridge, qué exige la declaración ética, qué forma tiene el cuerpo que efectivamente viaja al Bridge y qué formas tienen la respuesta de aceptación y el error de la API. Es la primera línea de validación —la que sitúa el mensaje bajo el campo en vez de esperar un 422 remoto— y SHALL mantenerse en paridad con `scan-payload-contract`, que sigue siendo la autoridad del sistema.

## Requirements

### Requirement: Forma de los datos del escaneo en el cliente

El frontend SHALL declarar en un único lugar la forma de los datos del escaneo que maneja: el formulario de escaneo (URL objetivo, sesión PHPSESSID, nivel de SQLMap, riesgo de SQLMap y aceptación ética), el cuerpo que viaja al Bridge, la respuesta de aceptación del Bridge (identificador de escaneo, estado y mensaje) y el error de la API (los cinco miembros de RFC 7807).

Los nombres de los miembros SHALL ser exactamente los que usa el Bridge en el cable —en `snake_case` cuando así viajan—, sin renombrado a la convención de TypeScript: un renombrado silencioso convierte un contrato verificable en una traducción que nadie ejercita hasta que rompe en runtime.

La declaración de la respuesta de aceptación y la del error SHALL ser tipos, no validadores de runtime: describen datos, no los parsean.

#### Scenario: Los cuatro contratos existen y son importables

- **WHEN** se importa el modelo de escaneo desde la API pública de la slice de escaneo
- **THEN** están disponibles el contrato del formulario, el del cuerpo que viaja al Bridge, el de la respuesta de aceptación y el del error de la API

#### Scenario: Los miembros conservan el nombre del cable

- **WHEN** se tipa el cuerpo de una solicitud de escaneo
- **THEN** sus miembros son `target_url`, `phpsessid`, `sqlmap_level` y `sqlmap_risk`, y NO variantes en `camelCase`

#### Scenario: La respuesta de aceptación solo admite el estado encolado

- **WHEN** se tipa una respuesta de aceptación del Bridge
- **THEN** declara `scan_id`, `status` y `message`, y `status` admite exactamente el valor `queued` y ningún otro

#### Scenario: El error de la API es espejo del Problem Details del Bridge

- **WHEN** se tipa un cuerpo de error recibido del Bridge
- **THEN** declara los cinco miembros de RFC 7807 (`type`, `title`, `status`, `detail`, `instance`), y `detail` admite ausencia de valor porque el Bridge lo emite nulo cuando el código de estado y el título ya son suficientes

### Requirement: La URL objetivo debe ser una URL absoluta con esquema HTTP o HTTPS

El schema de validación del formulario de escaneo SHALL aceptar como URL objetivo únicamente valores que sean URLs absolutas y bien formadas cuyo esquema sea `http` o `https`. Una cadena vacía, un texto arbitrario, una URL sin esquema o una URL con cualquier otro esquema —incluidos `ftp:`, `file:` y `javascript:`— SHALL rechazarse.

La restricción de esquema SHALL ser explícita y verificada por sí misma: comprobar únicamente que el valor "tiene forma de URL" NO alcanza, porque esa comprobación acepta esquemas que el Bridge rechaza y que, en el caso de `javascript:` y `file:`, no deberían siquiera poder escribirse en el campo.

El rechazo SHALL identificar la URL objetivo como el campo responsable, para que el formulario pueda situar el mensaje bajo ese campo y no como un error global. El mensaje de rechazo SHALL estar en español y SHALL nombrar los dos esquemas aceptados, de modo que quien lo lee sepa qué corregir. (RN-WS-02, HU-02-02)

#### Scenario: URL con esquema https es aceptada

- **WHEN** se valida un formulario cuya URL objetivo es `https://example.com/login.php`
- **THEN** la validación tiene éxito

#### Scenario: URL con esquema http y query string es aceptada

- **WHEN** se valida un formulario cuya URL objetivo es `http://testphp.vulnweb.com/artists.php?artist=1`
- **THEN** la validación tiene éxito y la query string se preserva

#### Scenario: URL sin esquema es rechazada

- **WHEN** se valida un formulario cuya URL objetivo es `example.com/login.php`
- **THEN** la validación falla e identifica a la URL objetivo como el campo en error

#### Scenario: Texto arbitrario es rechazado

- **WHEN** se valida un formulario cuya URL objetivo es `not-a-url`
- **THEN** la validación falla e identifica a la URL objetivo como el campo en error

#### Scenario: URL vacía es rechazada

- **WHEN** se valida un formulario cuya URL objetivo es la cadena vacía
- **THEN** la validación falla e identifica a la URL objetivo como el campo en error

#### Scenario: Esquemas distintos de http y https son rechazados

- **WHEN** se valida un formulario cuya URL objetivo usa el esquema `ftp:`, `file:` o `javascript:` (por ejemplo `ftp://example.com`, `file:///etc/passwd`, `javascript:alert(1)`)
- **THEN** la validación falla en los tres casos e identifica a la URL objetivo como el campo en error

#### Scenario: El espacio en blanco de los extremos no invalida una URL correcta

- **WHEN** se valida un formulario cuya URL objetivo es una URL válida pegada con espacios alrededor
- **THEN** la validación tiene éxito y el valor resultante no conserva esos espacios

### Requirement: La sesión PHPSESSID es obligatoria y no puede ser solo espacios

El schema de validación del formulario de escaneo SHALL exigir un PHPSESSID no vacío. Una cadena vacía SHALL rechazarse. Una cadena compuesta exclusivamente por espacios en blanco SHALL rechazarse igualmente: el espacio en blanco de los extremos SHALL eliminarse **antes** de evaluar si el valor está vacío, no después, de modo que un valor que solo contiene espacios no pueda pasar la validación quedando reducido a la cadena vacía.

El valor validado SHALL quedar sin espacios en los extremos, en paridad con la normalización que aplica el Bridge. El rechazo SHALL identificar al PHPSESSID como el campo responsable y su mensaje SHALL estar en español. (RN-WS-03, HU-02-03)

#### Scenario: PHPSESSID con contenido es aceptado

- **WHEN** se valida un formulario cuyo PHPSESSID es `a1b2c3d4e5f6g7h8`
- **THEN** la validación tiene éxito y el valor queda disponible tal cual

#### Scenario: PHPSESSID vacío es rechazado

- **WHEN** se valida un formulario cuyo PHPSESSID es la cadena vacía
- **THEN** la validación falla e identifica al PHPSESSID como el campo en error

#### Scenario: PHPSESSID de solo espacios es rechazado

- **WHEN** se valida un formulario cuyo PHPSESSID es `"   "` (solo espacios en blanco)
- **THEN** la validación falla e identifica al PHPSESSID como el campo en error, y NO tiene éxito devolviendo la cadena vacía

#### Scenario: El espacio en blanco de los extremos se elimina

- **WHEN** se valida un formulario cuyo PHPSESSID es `"  a1b2c3  "`
- **THEN** la validación tiene éxito y el valor resultante es `a1b2c3`

#### Scenario: PHPSESSID ausente es rechazado

- **WHEN** se valida un formulario que no incluye el campo PHPSESSID
- **THEN** la validación falla indicando que el campo es requerido

### Requirement: El nivel de SQLMap está acotado a 1..5 y el riesgo a 1..3, con valor por defecto 1

El schema de validación del formulario de escaneo SHALL aceptar como nivel de SQLMap únicamente enteros entre 1 y 5 inclusive, y como riesgo de SQLMap únicamente enteros entre 1 y 3 inclusive. Un valor fuera de rango SHALL rechazarse identificando su campo: el schema SHALL NOT recortar ni ajustar el valor al rango. Recortar en silencio dispararía un escaneo con parámetros distintos de los que el usuario pidió, y el Bridge rechazaría igual cualquier valor fuera de rango que llegara por otra vía.

Un valor no entero —un decimal, o un valor que no es un número— SHALL rechazarse.

Cuando cualquiera de los dos campos se omite, la validación SHALL tener éxito y el campo omitido SHALL tomar el valor 1. Estos valores por defecto SHALL aplicarse en el propio contrato de validación, no en la capa de formulario, de modo que cualquier consumidor del contrato obtenga los mismos valores sin depender de cómo se haya construido la interfaz. (RN-WS-04, RN-WS-05, HU-02-04)

#### Scenario: Valores dentro del rango son aceptados

- **WHEN** se valida un formulario con nivel `3` y riesgo `2`
- **THEN** la validación tiene éxito y los valores resultantes son `3` y `2`

#### Scenario: Los extremos de ambos rangos son aceptados

- **WHEN** se valida un formulario con nivel `1` y riesgo `1`, y otro con nivel `5` y riesgo `3`
- **THEN** ambas validaciones tienen éxito

#### Scenario: Nivel fuera de rango es rechazado sin recorte

- **WHEN** se valida un formulario con nivel `6`, y otro con nivel `0`
- **THEN** ambas validaciones fallan identificando al nivel como el campo en error, y el valor NO se recorta a `5` ni a `1`

#### Scenario: Riesgo fuera de rango es rechazado sin recorte

- **WHEN** se valida un formulario con riesgo `4`, y otro con riesgo `0`
- **THEN** ambas validaciones fallan identificando al riesgo como el campo en error, y el valor NO se recorta a `3` ni a `1`

#### Scenario: Un valor no entero es rechazado

- **WHEN** se valida un formulario cuyo nivel de SQLMap es `2.5`, y otro cuyo nivel es el texto `"alto"`
- **THEN** ambas validaciones fallan identificando al nivel como el campo en error

#### Scenario: Los campos omitidos toman el valor por defecto

- **WHEN** se valida un formulario que indica únicamente una URL objetivo válida, un PHPSESSID no vacío y la aceptación ética, sin nivel ni riesgo
- **THEN** la validación tiene éxito y los valores resultantes son `1` para el nivel y `1` para el riesgo

### Requirement: El escaneo solo se valida con la declaración ética aceptada

El schema de validación del formulario de escaneo SHALL exigir que la aceptación de la declaración ética esté marcada. El valor SHALL admitir exactamente la aceptación afirmativa: una aceptación sin marcar SHALL rechazarse, y la ausencia del campo SHALL rechazarse igualmente.

El rechazo SHALL identificar a la aceptación ética como el campo responsable y SHALL emitir un mensaje **en español** que explique que hay que aceptar la declaración para iniciar el escaneo. El mensaje SHALL ser el mismo tanto si el campo está sin marcar como si está ausente: para quien usa el formulario, ambos casos son el mismo problema. (RN-WS-01, HU-02-05)

#### Scenario: Declaración ética aceptada permite validar

- **WHEN** se valida un formulario por lo demás válido cuya aceptación ética está marcada
- **THEN** la validación tiene éxito

#### Scenario: Declaración ética sin marcar es rechazada

- **WHEN** se valida un formulario por lo demás válido cuya aceptación ética está sin marcar
- **THEN** la validación falla e identifica a la aceptación ética como el campo en error

#### Scenario: Declaración ética ausente es rechazada

- **WHEN** se valida un formulario por lo demás válido que no incluye el campo de aceptación ética
- **THEN** la validación falla e identifica a la aceptación ética como el campo en error

#### Scenario: El mensaje de la declaración ética está en español en ambos casos de fallo

- **WHEN** se inspecciona el mensaje de error producido por una aceptación sin marcar y el producido por una aceptación ausente
- **THEN** ambos son el mismo mensaje en español, y ninguno es el mensaje por defecto del validador en inglés

### Requirement: La aceptación ética no forma parte del cuerpo que viaja al Bridge

El contrato del cuerpo de la solicitud de escaneo SHALL contener exactamente los cuatro parámetros del escaneo —URL objetivo, sesión, nivel y riesgo— y SHALL NOT contener la aceptación ética. La aceptación ética es una condición de la interfaz (RN-WS-01), no un dato del dominio del escaneo: el Bridge la descarta y no forma parte de su contrato de solicitud.

Esta exclusión SHALL estar impuesta por el contrato de tipos, no solo documentada, de modo que ningún cliente HTTP posterior pueda componer un cuerpo que la incluya sin que el chequeo de tipos lo rechace.

#### Scenario: El cuerpo declarado tiene exactamente cuatro campos

- **WHEN** se construye el cuerpo de una solicitud de escaneo a partir de un formulario validado
- **THEN** sus claves son exactamente `target_url`, `phpsessid`, `sqlmap_level` y `sqlmap_risk`, sin la aceptación ética

#### Scenario: El cuerpo lleva los valores por defecto que aplicó la validación

- **WHEN** se construye el cuerpo a partir de un formulario validado que omitió el nivel y el riesgo
- **THEN** el cuerpo lleva `1` en ambos campos, y no campos ausentes ni nulos

### Requirement: El formulario se valida como un todo y reporta cada campo inválido

La validación del formulario de escaneo SHALL evaluarse sobre el formulario completo: cuando más de un campo es inválido, el resultado SHALL incluir una entrada de error por cada campo inválido, no solo por el primero, y cada entrada SHALL identificar su campo responsable. Esto es lo que permite que el formulario muestre todos los mensajes en la misma pasada, en lugar de obligar a corregir un campo por intento.

Un campo desconocido presente en la entrada SHALL NOT provocar el rechazo de un formulario por lo demás válido, y SHALL NOT aparecer en el resultado validado. (HU-03-04, RN-WS-09)

#### Scenario: Múltiples campos inválidos producen múltiples errores

- **WHEN** se valida un formulario con URL objetivo sin esquema, PHPSESSID vacío, nivel `9` y aceptación ética sin marcar simultáneamente
- **THEN** la validación falla y el resultado contiene al menos un error por cada uno de los cuatro campos, cada uno identificando su campo responsable

#### Scenario: Un campo desconocido se descarta sin romper la validación

- **WHEN** se valida un formulario válido que además incluye un campo no declarado en el contrato
- **THEN** la validación tiene éxito y el campo desconocido no forma parte del resultado validado

### Requirement: La validación del cliente mantiene paridad verificada con el contrato del Bridge

Los rangos de los parámetros de SQLMap y sus valores por defecto declarados en el cliente SHALL coincidir con los que declara el contrato de solicitud del Bridge (`scan-payload-contract`). Esa coincidencia SHALL estar verificada de forma automática contra la declaración real del Bridge, no afirmada por comentario ni por un valor literal repetido en un test: un chequeo que repite el número no detecta el cambio unilateral de la política en el backend, que es exactamente el fallo que esta paridad existe para prevenir.

Cuando la declaración del Bridge no pueda leerse o interpretarse, la verificación SHALL fallar de forma ruidosa nombrando el dato que no pudo obtener, y SHALL NOT saltearse en silencio: un chequeo de paridad que se auto-desactiva da una sensación de cobertura que ya no existe.

El Bridge SHALL seguir siendo la autoridad: ante una divergencia real, es el cliente el que se corrige para reflejarlo.

#### Scenario: Los rangos del cliente coinciden con los del Bridge

- **WHEN** se comparan los límites de nivel y de riesgo declarados en el cliente con los declarados en el contrato de solicitud del Bridge
- **THEN** coinciden en los cuatro límites (mínimo y máximo de cada parámetro)

#### Scenario: Los valores por defecto del cliente coinciden con los del Bridge

- **WHEN** se comparan los valores por defecto de nivel y de riesgo declarados en el cliente con los del contrato de solicitud del Bridge
- **THEN** coinciden en ambos

#### Scenario: La verificación falla nombrando el dato ilegible

- **WHEN** la declaración del Bridge no está disponible o no contiene el dato buscado
- **THEN** la verificación falla con un mensaje que nombra el dato que no pudo obtener, en lugar de darse por satisfecha

### Requirement: La slice de escaneo es un modelo puro expuesto por una API pública

El modelo de escaneo del cliente SHALL ser puro: SHALL NOT depender de React, de un cliente HTTP, del almacenamiento del navegador ni del estado de sesión, y SHALL poder ejecutarse fuera de un navegador. SHALL NOT importar de ninguna capa superior a la de entidades.

Los consumidores SHALL acceder al modelo de escaneo a través de la API pública de la slice, y SHALL NOT importar sus módulos internos por ruta profunda.

#### Scenario: La slice no arrastra dependencias de interfaz ni de red

- **WHEN** se inspeccionan las dependencias de los módulos del modelo de escaneo
- **THEN** ninguno importa React, un cliente HTTP, el estado de sesión ni el almacenamiento del navegador

#### Scenario: La slice respeta la dirección de las capas

- **WHEN** se inspeccionan los imports de los módulos del modelo de escaneo
- **THEN** ninguno importa de las capas de aplicación, páginas, widgets o features

#### Scenario: Los consumidores importan desde la API pública

- **WHEN** un consumidor necesita el schema de validación o los tipos del escaneo
- **THEN** los obtiene de la API pública de la slice, no de una ruta interna de su modelo
