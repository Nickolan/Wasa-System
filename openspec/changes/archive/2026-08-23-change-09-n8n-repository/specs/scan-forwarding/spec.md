## Purpose

Define cómo el FastAPI Bridge entrega un escaneo ya validado al orquestador n8n: a dónde viaja el mensaje, cómo se autentica, cuánto se espera por una respuesta, qué respuesta cuenta como aceptación y cuál como indisponibilidad, y qué garantías de aislamiento —secreto que no se filtra, mecanismo de entrega independiente del framework web— rodean esa entrega. Es la contraparte de transporte de `scan-payload-contract`: aquella define la forma del mensaje, ésta define su entrega.

## ADDED Requirements

### Requirement: El destino y la credencial de la entrega provienen de la configuración del entorno

La entrega del escaneo al orquestador SHALL dirigirse a la URL de webhook declarada en la configuración del Bridge, y SHALL autenticarse con el token de webhook declarado en esa misma configuración. Ni la URL ni el token SHALL estar embebidos en el código del mecanismo de entrega, y el mecanismo de entrega SHALL NOT leer variables de entorno por su cuenta: recibe la configuración ya resuelta y tipada. Cambiar el destino o rotar el token SHALL ser un cambio de entorno, sin recompilar ni editar código. (RN-WS-07, HU-03-05)

#### Scenario: El mensaje viaja a la URL configurada

- **WHEN** se entrega un escaneo con una configuración cuya URL de webhook es un valor dado
- **THEN** la solicitud saliente se dirige exactamente a esa URL, y a ninguna otra

#### Scenario: Cambiar la configuración cambia el destino sin tocar el mecanismo

- **WHEN** se entregan dos escaneos con dos configuraciones que declaran URLs de webhook distintas
- **THEN** cada entrega se dirige a la URL de su propia configuración, sin ninguna modificación del mecanismo de entrega

#### Scenario: No hay destino por defecto embebido en el mecanismo

- **WHEN** se inspecciona el mecanismo de entrega
- **THEN** no contiene ninguna URL de webhook literal ni ninguna lectura directa de variables de entorno: toda la configuración llega desde afuera

### Requirement: Cada entrega se autentica con el header X-WASA-TOKEN

Toda solicitud dirigida al webhook del orquestador SHALL incluir el header `X-WASA-TOKEN` con el valor del token de webhook configurado. El header SHALL enviarse en **cada** entrega, sin excepción y sin depender de estado previo. El valor enviado SHALL ser el secreto en claro que espera el orquestador, no su envoltorio de protección ni su representación ofuscada. (RN-WS-07, HU-03-05)

#### Scenario: El header de autenticación está presente en la solicitud

- **WHEN** se entrega un escaneo al orquestador
- **THEN** la solicitud saliente incluye el header `X-WASA-TOKEN` con el valor del token configurado

#### Scenario: El header se envía en cada entrega, no sólo en la primera

- **WHEN** se entregan dos escaneos consecutivos usando el mismo canal de comunicación
- **THEN** ambas solicitudes salientes incluyen el header `X-WASA-TOKEN` con el token configurado

#### Scenario: El token viaja desenvuelto, no como texto ofuscado

- **WHEN** el token está declarado en la configuración como valor sensible protegido
- **THEN** el header transporta el secreto real y NO la representación ofuscada del envoltorio (por ejemplo, nunca un valor como `**********`)

### Requirement: El mensaje entregado es el contrato de escaneo serializado como JSON

El cuerpo de la solicitud dirigida al orquestador SHALL ser la representación JSON del mensaje de escaneo definido por `scan-payload-contract`: exactamente los cinco campos del contrato —URL objetivo, PHPSESSID, nivel de SQLMap, riesgo de SQLMap e identificador del escaneo— sin campos adicionales, sin envoltorios y sin renombres. La solicitud SHALL declararse como contenido JSON. El mecanismo de entrega SHALL NOT revalidar, completar ni transformar el contenido del mensaje: recibe un mensaje ya validado y lo transporta tal cual. (RN-WS-07, HU-03-05)

#### Scenario: El cuerpo contiene exactamente los cinco campos del contrato

- **WHEN** se entrega un mensaje de escaneo válido
- **THEN** el cuerpo JSON de la solicitud saliente tiene exactamente las cinco claves del contrato, con los mismos valores del mensaje

#### Scenario: La URL objetivo viaja como texto

- **WHEN** se entrega un mensaje de escaneo cuya URL objetivo fue validada aguas arriba
- **THEN** en el cuerpo JSON la URL objetivo aparece como cadena de texto, consumible directamente por el orquestador

#### Scenario: La solicitud se declara como JSON

- **WHEN** se entrega un mensaje de escaneo
- **THEN** la solicitud saliente indica contenido JSON, de modo que el nodo de webhook del orquestador pueda parsearla sin configuración adicional

### Requirement: La entrega está acotada a 10 segundos de espera

Cada intento de entrega SHALL tener un límite máximo de espera de 10 segundos. Superado ese límite sin respuesta completa del orquestador, el intento SHALL abortarse y SHALL reportarse como indisponibilidad del orquestador. El límite SHALL aplicar a la operación de entrega en sí, de modo que el mecanismo de entrega sea el dueño de esa garantía y no dependa de cómo esté configurado el canal de comunicación que se le inyecta. Ninguna entrega SHALL poder bloquear al Bridge indefinidamente. (RN-WS-07, Flujo 3)

#### Scenario: Una entrega que no responde a tiempo se aborta

- **WHEN** el orquestador no responde dentro del límite de espera
- **THEN** la entrega se aborta y se reporta indisponibilidad del orquestador, en lugar de esperar indefinidamente

#### Scenario: El límite lo impone la entrega, no el canal

- **WHEN** se entrega un escaneo a través de un canal de comunicación que no declara ningún límite de espera propio
- **THEN** la entrega igualmente queda acotada a 10 segundos

### Requirement: Sólo una respuesta 2xx cuenta como aceptación del escaneo

La entrega SHALL considerarse exitosa cuando el orquestador responde con cualquier código de estado 2xx (200–299). Ante una respuesta 2xx, la entrega SHALL reportar éxito al llamador. Cualquier otro código de estado —redirecciones, errores de cliente y errores de servidor— SHALL tratarse como indisponibilidad del orquestador y SHALL NOT reportarse como éxito. La entrega SHALL NOT interpretar el cuerpo de la respuesta para decidir: el código de estado es el único criterio. (RN-WS-07, HU-03-05, Flujo 3)

#### Scenario: Respuesta 200 reporta éxito

- **WHEN** el orquestador responde 200 a la entrega de un escaneo
- **THEN** la entrega reporta éxito al llamador

#### Scenario: Respuesta 500 se trata como indisponibilidad

- **WHEN** el orquestador responde 500 a la entrega de un escaneo
- **THEN** la entrega no reporta éxito: señaliza indisponibilidad del orquestador

#### Scenario: Otro 2xx distinto de 200 también cuenta como aceptación

- **WHEN** el orquestador responde 201 o 204 a la entrega de un escaneo
- **THEN** la entrega reporta éxito al llamador, porque el criterio de aceptación es cualquier código 2xx

#### Scenario: Errores de cliente y redirecciones tampoco cuentan como aceptación

- **WHEN** el orquestador responde 401, 404 o 302 a la entrega de un escaneo
- **THEN** la entrega señaliza indisponibilidad del orquestador

#### Scenario: El cuerpo de la respuesta no altera el veredicto

- **WHEN** el orquestador responde 200 con un cuerpo vacío, y en otra ocasión 200 con un cuerpo arbitrario o no parseable
- **THEN** ambas entregas reportan éxito, porque el veredicto depende sólo del código de estado

### Requirement: Toda falla de entrega se señaliza como una condición de orquestador no disponible, distinguible de cualquier otro error

Cuando la entrega no puede completarse con éxito —por timeout, por imposibilidad de establecer la conexión, por cualquier falla de transporte, o por una respuesta cuyo código está fuera del rango 2xx— el mecanismo de entrega SHALL señalizarlo levantando una condición de error de dominio propia y única para "el orquestador no está disponible". Esa condición SHALL ser distinguible por tipo de cualquier otro error del sistema, de modo que el borde HTTP pueda mapearla sin ambigüedad a 502 Bad Gateway en formato RFC 7807. Las fallas de transporte de la librería de comunicación SHALL NOT escaparse crudas hacia las capas superiores. (RN-WS-07, RN-WS-09, Flujo 3)

#### Scenario: Un timeout produce la condición de indisponibilidad

- **WHEN** la entrega supera el límite de espera
- **THEN** se levanta la condición de orquestador no disponible, y no un error de timeout crudo de la librería de comunicación

#### Scenario: Un orquestador inalcanzable produce la condición de indisponibilidad

- **WHEN** no es posible establecer conexión con el orquestador (host caído, DNS que no resuelve, conexión rechazada)
- **THEN** se levanta la condición de orquestador no disponible, y no un error de conexión crudo de la librería de comunicación

#### Scenario: Una respuesta no aceptada produce la misma condición

- **WHEN** el orquestador responde con un código fuera del rango 2xx (3xx, 4xx o 5xx)
- **THEN** se levanta la misma condición de orquestador no disponible que ante un timeout, de modo que el borde HTTP tenga un único caso que manejar

#### Scenario: La condición es distinguible por tipo

- **WHEN** una capa superior captura la falla de entrega
- **THEN** puede identificarla por su tipo específico de dominio sin inspeccionar mensajes de texto, y sin capturar errores genéricos que también atraparían fallas no relacionadas

### Requirement: El token de webhook nunca se filtra fuera del header de autenticación

El token de webhook SHALL usarse exclusivamente para construir el header de autenticación de la solicitud saliente. SHALL NOT aparecer en el mensaje de la condición de error levantada ante una falla, ni en logs, ni en ninguna representación textual del mecanismo de entrega o de sus errores. El diagnóstico de una entrega fallida SHALL poder leerse íntegro sin exponer el secreto. (Seguridad — secrets management)

#### Scenario: El error de indisponibilidad no contiene el token

- **WHEN** la entrega falla por cualquier causa y se inspecciona el texto de la condición de error resultante
- **THEN** el token de webhook no aparece en ninguna parte de ese texto

#### Scenario: El diagnóstico de la falla identifica la causa sin exponer el secreto

- **WHEN** la entrega falla y una capa superior necesita saber por qué
- **THEN** la condición de error describe la causa (no responde a tiempo, inalcanzable, o respuesta no aceptada) sin incluir el token ni el contenido de la respuesta del orquestador

### Requirement: Cada solicitud de escaneo produce a lo sumo un intento de entrega

El mecanismo de entrega SHALL realizar un único intento por escaneo: SHALL NOT reintentar automáticamente ante timeout, ante falla de conexión ni ante una respuesta no aceptada. Una falla se señaliza de inmediato al llamador. Esto preserva la semántica *fire-and-forward* del Bridge y evita disparar el mismo escaneo más de una vez en el orquestador cuando la respuesta se pierde pero la solicitud sí llegó. (RN-WS-07)

#### Scenario: Una respuesta de error no dispara un segundo intento

- **WHEN** el orquestador responde con un código fuera del rango 2xx
- **THEN** se señaliza la indisponibilidad sin haber emitido una segunda solicitud al webhook

#### Scenario: Un timeout no dispara un segundo intento

- **WHEN** la entrega supera el límite de espera
- **THEN** se señaliza la indisponibilidad sin haber emitido una segunda solicitud al webhook

### Requirement: La entrega no espera el resultado del escaneo

La entrega SHALL confirmar únicamente que el orquestador aceptó el disparo, y SHALL NOT esperar, consultar ni interpretar el resultado del escaneo. El Bridge SHALL NOT ejecutar herramientas de seguridad ni conocer el progreso del workflow: su responsabilidad termina cuando el orquestador acepta el mensaje. (RN-WS-07)

#### Scenario: El éxito significa "aceptado", no "escaneado"

- **WHEN** la entrega de un escaneo reporta éxito
- **THEN** ese éxito significa exclusivamente que el orquestador aceptó el disparo, sin ninguna afirmación sobre hallazgos, progreso ni finalización del escaneo

#### Scenario: No hay consulta de seguimiento al orquestador

- **WHEN** la entrega de un escaneo se completa con éxito
- **THEN** no se emite ninguna solicitud adicional al orquestador para consultar estado o resultados

### Requirement: El mecanismo de entrega es independiente del framework web

El mecanismo de entrega SHALL ser utilizable fuera del framework web: SHALL NOT depender de tipos, decoradores ni mecanismos de inyección del framework HTTP que expone la API del Bridge, ni de la librería ASGI subyacente, ni de sus middlewares. SHALL NOT crear ni destruir el canal de comunicación que usa: lo recibe ya construido y su ciclo de vida es responsabilidad de quien lo inyecta. Un script de línea de comandos SHALL poder disparar una entrega sin levantar la aplicación web. (Regla dura de capas: Router → Service → UoW → Repository)

#### Scenario: Ningún import del framework web en la capa de entrega

- **WHEN** se inspeccionan los imports del módulo que implementa la entrega
- **THEN** no importa el framework web de la API, ni la librería ASGI subyacente, ni la librería de rate limiting

#### Scenario: La entrega funciona sin la aplicación web levantada

- **WHEN** se ejecuta una entrega desde un contexto que no instancia la aplicación web
- **THEN** la entrega se comporta igual: mismo destino, mismo header, mismo criterio de éxito y misma condición de error

#### Scenario: El canal de comunicación se recibe, no se crea

- **WHEN** se construye el mecanismo de entrega
- **THEN** el canal de comunicación llega desde afuera y el mecanismo no lo abre ni lo cierra, dejando su ciclo de vida al componente que lo gobierna
