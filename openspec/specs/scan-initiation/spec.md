## Purpose

Define la **iniciación de un escaneo** como acto de negocio del FastAPI Bridge: qué dato produce el Bridge por su cuenta al aceptar una solicitud (el identificador único del escaneo), cómo se compone a partir de una solicitud ya validada el mensaje que recibe el orquestador, cuántas entregas genera una solicitud, qué confirmación recibe quien la pidió y qué le llega cuando el orquestador no estuvo disponible. Es la pieza de decisión que faltaba entre `scan-payload-contract` (qué forma tienen los mensajes), `scan-resource-lifecycle` (quién abre y cierra el canal) y `scan-forwarding` (cómo viaja el mensaje): aquéllas describen formas y mecanismos, ésta describe **quién decide iniciar** y **qué se le responde a quien lo pidió**.

## Requirements

### Requirement: Cada escaneo iniciado recibe un identificador generado por el Bridge

Al iniciar un escaneo, el sistema SHALL generar un identificador para ese escaneo. El identificador SHALL ser un UUID versión 4, expresado como texto. SHALL ser generado por el Bridge y SHALL NOT provenir de la solicitud del cliente, derivarse de ninguno de sus campos ni poder ser influido por ellos: dos solicitudes con datos idénticos SHALL recibir identificadores distintos. El identificador SHALL NOT ser un contador ni una secuencia, ni SHALL incorporar información del proceso, del anfitrión ni del instante de generación: no debe ser adivinable ni enumerable por un cliente. (HU-03-04, RN-WS-07)

#### Scenario: La iniciación produce un identificador con forma de UUID v4

- **WHEN** se inicia un escaneo con una solicitud válida
- **THEN** el identificador del escaneo es un texto que se interpreta como un UUID de versión 4

#### Scenario: Dos solicitudes idénticas reciben identificadores distintos

- **WHEN** se inician dos escaneos con exactamente los mismos datos de solicitud
- **THEN** cada uno recibe un identificador distinto del otro

#### Scenario: El identificador no proviene de la solicitud

- **WHEN** se inspecciona el identificador generado frente a los campos de la solicitud que lo originó
- **THEN** el identificador no coincide con ninguno de ellos ni contiene sus valores: no es derivable de la entrada

#### Scenario: Ningún campo de la solicitud puede fijar el identificador

- **WHEN** se inicia un escaneo con una solicitud que incluye un campo desconocido que pretende fijar el identificador del escaneo
- **THEN** el identificador del escaneo sigue siendo el generado por el Bridge, y el valor propuesto por el cliente no aparece en ninguna parte

### Requirement: El mensaje al orquestador se compone de la solicitud ya validada más el identificador generado

La iniciación de un escaneo SHALL componer el mensaje dirigido al orquestador tomando los parámetros de la solicitud **ya validada** —URL objetivo, sesión, nivel y riesgo— y agregándoles el identificador generado. Los valores SHALL trasladarse fielmente, incluidos los valores por defecto que la validación haya aplicado y las normalizaciones que haya realizado sobre ellos; la iniciación SHALL NOT alterarlos, reinterpretarlos ni sustituirlos. La URL objetivo SHALL trasladarse como texto plano serializable, según lo exige el contrato del mensaje. La iniciación SHALL NOT agregar al mensaje ningún dato que no pertenezca al contrato, ni propagar campos desconocidos recibidos en la solicitud. (RN-WS-07, HU-03-04)

#### Scenario: Los cuatro parámetros de la solicitud llegan intactos al orquestador

- **WHEN** se inicia un escaneo con una solicitud válida
- **THEN** el mensaje entregado al orquestador lleva la URL objetivo, la sesión, el nivel y el riesgo con exactamente los valores validados de esa solicitud

#### Scenario: Los valores por defecto aplicados por la validación viajan al orquestador

- **WHEN** se inicia un escaneo con una solicitud que omitió el nivel y el riesgo, y la validación aplicó sus valores por defecto
- **THEN** el mensaje entregado al orquestador lleva esos valores por defecto, y no campos ausentes ni nulos

#### Scenario: Las normalizaciones de la validación se preservan

- **WHEN** se inicia un escaneo cuya solicitud validada normalizó alguno de sus campos —una sesión a la que se le quitaron los espacios de los extremos, una URL objetivo a la que se le normalizó la forma—
- **THEN** el mensaje entregado al orquestador lleva la forma normalizada, no la forma cruda original

#### Scenario: La URL objetivo viaja como texto

- **WHEN** se inicia un escaneo y el mensaje resultante se serializa para su entrega
- **THEN** la URL objetivo aparece como una cadena de texto, sin requerir ninguna transformación adicional en el momento del envío

#### Scenario: El mensaje lleva exactamente los campos del contrato

- **WHEN** se inicia un escaneo a partir de una solicitud que incluye campos desconocidos
- **THEN** el mensaje entregado al orquestador contiene exactamente los cinco campos de su contrato, sin ninguno de los campos desconocidos y sin agregados propios de la iniciación

### Requirement: Una solicitud de escaneo produce exactamente una entrega, dentro de un único ámbito de recursos

La iniciación de un escaneo SHALL producir a lo sumo una entrega al orquestador por cada solicitud recibida, y SHALL realizarla dentro de un ámbito de recursos de escaneo abierto para esa operación. SHALL NOT reintentar una entrega fallida, SHALL NOT emitir entregas especulativas y SHALL NOT reutilizar un ámbito entre operaciones distintas: cada iniciación abre el suyo. El ámbito SHALL quedar cerrado cuando la iniciación termina, tanto si la entrega fue aceptada como si falló — el mismo escaneo no puede quedar disparado dos veces contra la infraestructura objetivo, ni dejar recursos de red colgando. (RN-WS-07, HU-03-05)

#### Scenario: Una solicitud produce una sola entrega

- **WHEN** se inicia un escaneo con una solicitud válida y el orquestador la acepta
- **THEN** se realiza exactamente una entrega al orquestador

#### Scenario: Una entrega fallida no se reintenta

- **WHEN** se inicia un escaneo y la entrega falla porque el orquestador no está disponible
- **THEN** no se realiza ninguna entrega adicional: la iniciación termina con esa sola tentativa

#### Scenario: Cada iniciación abre su propio ámbito de recursos

- **WHEN** se inician dos escaneos, uno después del otro
- **THEN** cada iniciación abre su propio ámbito de recursos, y ninguna reutiliza el ámbito de la otra

#### Scenario: El ámbito se cierra al terminar la iniciación, haya funcionado o no

- **WHEN** la iniciación de un escaneo termina, ya sea porque la entrega fue aceptada o porque el orquestador no estuvo disponible
- **THEN** el ámbito de recursos que abrió queda cerrado

### Requirement: La confirmación devuelta identifica el mismo escaneo que se entregó

Cuando la entrega al orquestador es aceptada, la iniciación SHALL devolver una confirmación de escaneo encolado. El identificador que lleva esa confirmación SHALL ser **exactamente el mismo** que viajó en el mensaje entregado al orquestador: es el único vínculo con el que quien solicitó el escaneo podrá reconocer sus resultados en el Dashboard, y una discrepancia lo dejaría sin forma de encontrarlos. El estado de la confirmación SHALL ser `queued` y SHALL NOT expresar ningún otro estado. La confirmación SHALL incluir un mensaje legible para una persona, no vacío. (HU-03-05, RN-WS-08)

#### Scenario: El identificador de la confirmación coincide con el entregado

- **WHEN** se inicia un escaneo y la entrega al orquestador es aceptada
- **THEN** el identificador de la confirmación devuelta es idéntico al identificador que viajó en el mensaje entregado

#### Scenario: La confirmación declara el escaneo como encolado

- **WHEN** se inicia un escaneo y la entrega al orquestador es aceptada
- **THEN** la confirmación devuelta declara el estado `queued`

#### Scenario: La confirmación incluye un mensaje legible

- **WHEN** se inicia un escaneo y la entrega al orquestador es aceptada
- **THEN** la confirmación devuelta incluye un mensaje legible para una persona, no vacío

### Requirement: La confirmación significa entrega aceptada, no escaneo terminado

La iniciación SHALL devolver la confirmación en cuanto el orquestador acepta la entrega, y SHALL NOT esperar a que el escaneo se ejecute, progrese ni termine: el Bridge no ejecuta herramientas de seguridad, sólo valida y delega. La confirmación SHALL NOT incluir resultados, hallazgos, progreso ni duración estimada del escaneo. Si la entrega no fue aceptada, la iniciación SHALL NOT devolver ninguna confirmación. (RN-WS-07, Flujo 3)

#### Scenario: La iniciación no espera el resultado del escaneo

- **WHEN** se inicia un escaneo y el orquestador acepta la entrega
- **THEN** la iniciación termina inmediatamente con la confirmación, sin quedarse esperando ejecución, progreso ni resultados

#### Scenario: Una entrega no aceptada no produce confirmación

- **WHEN** se inicia un escaneo y la entrega al orquestador no es aceptada
- **THEN** la iniciación no devuelve ninguna confirmación de escaneo encolado

#### Scenario: La confirmación no transporta resultados

- **WHEN** se inspecciona la confirmación devuelta por una iniciación exitosa
- **THEN** no contiene hallazgos, vulnerabilidades, progreso ni ningún dato de resultado del escaneo

### Requirement: La indisponibilidad del orquestador atraviesa la iniciación sin alterarse

Cuando la entrega señaliza que el orquestador no está disponible, la iniciación SHALL dejar que esa condición llegue a su llamador **con su tipo original y sin envolturas**. SHALL NOT capturarla, silenciarla, traducirla a otra condición de error ni convertirla en una confirmación de éxito, y SHALL NOT sustituirla por un identificador de escaneo devuelto "de todos modos". Esto garantiza que la capa que traduce condiciones a respuestas HTTP siga teniendo exactamente un caso que reconocer para responder 502. Cualquier otra condición de error originada dentro de la iniciación SHALL llegar igualmente al llamador, sin quedar enmascarada como indisponibilidad del orquestador. (RN-WS-09, Flujo 3)

#### Scenario: La condición de orquestador no disponible llega al llamador

- **WHEN** la entrega dentro de una iniciación señaliza que el orquestador no está disponible
- **THEN** el llamador recibe esa misma condición, identificable por su tipo, y no una confirmación de éxito

#### Scenario: La condición no se envuelve ni se traduce

- **WHEN** el llamador observa la condición de indisponibilidad producida por una iniciación
- **THEN** es la condición original, no otra que la contenga o la reemplace, y conserva su información de diagnóstico

#### Scenario: Ninguna otra condición se enmascara como indisponibilidad

- **WHEN** dentro de una iniciación se produce una condición de error que no es la indisponibilidad del orquestador
- **THEN** el llamador recibe esa condición tal como se originó, sin que la iniciación la reetiquete como indisponibilidad

### Requirement: La iniciación no abre por su cuenta canales de red ni conexiones a la base de datos

La iniciación de un escaneo SHALL obtener todo acceso a infraestructura a través del ámbito de recursos de escaneo. SHALL NOT construir, configurar ni cerrar por su cuenta el canal de comunicación saliente hacia el orquestador, SHALL NOT abrir conexiones a la base de datos compartida y SHALL NOT leer configuración del entorno por su cuenta: no conoce el destino ni la credencial del orquestador, que resuelve el ámbito de recursos y usa el mecanismo de entrega. Esto mantiene un único lugar auditable donde se abren y cierran recursos de red. (Regla de capas: Router → Service → UoW → Repository)

#### Scenario: Ningún cliente de red se construye en la capa de iniciación

- **WHEN** se inspecciona el componente que implementa la iniciación de escaneos
- **THEN** no construye ni configura ningún cliente de comunicación saliente, ni importa la librería que los provee

#### Scenario: La base de datos compartida no se toca

- **WHEN** se inicia un escaneo de principio a fin
- **THEN** no se abre ninguna conexión a la base de datos compartida ni se lee o escribe ninguna de sus tablas

#### Scenario: La iniciación no conoce el destino ni la credencial del orquestador

- **WHEN** se inspecciona el componente que implementa la iniciación de escaneos
- **THEN** no contiene ninguna URL ni credencial de orquestador, ni ninguna lectura directa de variables de entorno

### Requirement: La iniciación es independiente del framework web

El componente que implementa la iniciación de escaneos SHALL ser utilizable fuera del framework web: SHALL NOT depender de tipos, decoradores ni mecanismos de inyección del framework HTTP que expone la API del Bridge, ni de la librería ASGI subyacente, ni de sus middlewares, ni construir respuestas HTTP. Un script de línea de comandos SHALL poder iniciar un escaneo sin levantar la aplicación web. Recíprocamente, la capa HTTP SHALL poder delegarle la operación completa sin necesitar lógica propia: la decisión de qué se genera, qué se compone y qué se entrega vive acá y no allá. (Regla dura: el Router nunca contiene lógica de negocio)

#### Scenario: La iniciación funciona sin la aplicación web levantada

- **WHEN** se inicia un escaneo desde un contexto que no instancia la aplicación web
- **THEN** la iniciación se comporta igual: genera el identificador, compone el mensaje, entrega y devuelve la confirmación

#### Scenario: La iniciación no produce respuestas HTTP

- **WHEN** se inspecciona lo que devuelve y lo que señaliza la iniciación
- **THEN** devuelve la confirmación de escaneo y señaliza condiciones de dominio, nunca códigos de estado, cuerpos ni objetos de respuesta HTTP

### Requirement: La iniciación no revalida ni relaja el contrato de entrada

La iniciación SHALL operar sobre una solicitud **ya validada** y SHALL NOT reimplementar la validación de sus campos: no vuelve a comprobar el esquema de la URL, la presencia de la sesión ni los rangos de nivel y riesgo, y SHALL NOT completar por su cuenta valores ausentes ni corregir valores fuera de rango. Duplicar esas reglas acá abriría la posibilidad de que las dos copias divergieran y de que el mensaje entregado al orquestador dejara de coincidir con lo que la validación aceptó. (RN-WS-02..05, autoridad única de validación)

#### Scenario: No hay revalidación de los parámetros de la solicitud

- **WHEN** se inspecciona el componente que implementa la iniciación de escaneos
- **THEN** no contiene comprobaciones propias del esquema de la URL, de la presencia de la sesión ni de los rangos de nivel y riesgo

#### Scenario: La iniciación no completa ni corrige valores

- **WHEN** se inicia un escaneo con una solicitud válida
- **THEN** los valores entregados al orquestador son los de la solicitud validada, sin sustituciones ni correcciones aplicadas por la iniciación

### Requirement: Las credenciales de la solicitud no se filtran fuera del mensaje al orquestador

La sesión que acompaña a la solicitud es una credencial de la aplicación objetivo. La iniciación SHALL usarla únicamente para componer el mensaje dirigido al orquestador y SHALL NOT emitirla por ningún otro canal: SHALL NOT registrarla en logs, SHALL NOT incluirla en la confirmación devuelta a quien solicitó el escaneo y SHALL NOT incorporarla al mensaje de ninguna condición de error que propague. (RN-WS-07, Seguridad)

#### Scenario: La confirmación no incluye la sesión

- **WHEN** se inspecciona la confirmación devuelta por una iniciación exitosa
- **THEN** no contiene la sesión de la solicitud ni ninguna parte de ella

#### Scenario: La condición de error no incluye la sesión

- **WHEN** una iniciación termina porque el orquestador no está disponible
- **THEN** la información de diagnóstico que llega al llamador no contiene la sesión de la solicitud ni la URL objetivo completa como credencial

#### Scenario: La iniciación no registra la solicitud en logs

- **WHEN** se inspecciona el componente que implementa la iniciación de escaneos
- **THEN** no emite registros que contengan los campos de la solicitud
