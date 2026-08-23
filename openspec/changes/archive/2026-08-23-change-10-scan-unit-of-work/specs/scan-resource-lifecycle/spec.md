## Purpose

Define quién gobierna el ciclo de vida del canal de comunicación saliente que usa la entrega de escaneos al orquestador: cuándo se abre, cuándo se cierra, qué garantías de cierre valen incluso cuando la operación termina por error, de dónde sale la configuración que el canal y el mecanismo de entrega necesitan, y bajo qué ámbito queda disponible ese mecanismo para quien lo consume. Es la contraparte de gobierno de recursos de `scan-forwarding`: aquella define **cómo viaja** el mensaje dando por sentado un canal ya abierto; ésta define **quién abre y cierra ese canal**.

## ADDED Requirements

### Requirement: Cada operación de escaneo se ejecuta dentro de un ámbito de recursos delimitado

El sistema SHALL ofrecer un **ámbito de recursos de escaneo**: una unidad con un inicio y un fin explícitos, dentro de la cual el mecanismo de entrega al orquestador está disponible y fuera de la cual no lo está. Al iniciar el ámbito, el canal de comunicación saliente SHALL quedar abierto y el mecanismo de entrega SHALL quedar construido sobre ese canal. Al terminar el ámbito —por cualquier causa— el canal SHALL quedar cerrado. Abrir el ámbito SHALL ser suficiente para operar: no SHALL requerirse ningún paso de inicialización adicional por parte del consumidor. (HU-03-05, Unit of Work)

#### Scenario: Iniciar el ámbito deja el mecanismo de entrega listo para usar

- **WHEN** se inicia un ámbito de recursos de escaneo
- **THEN** el mecanismo de entrega al orquestador queda disponible dentro de ese ámbito, sin ningún paso de inicialización extra

#### Scenario: El ámbito se abre sin necesidad de argumentos

- **WHEN** se abre un ámbito de recursos de escaneo sin proporcionarle ningún argumento
- **THEN** el ámbito se inicia correctamente y el mecanismo de entrega queda disponible, resolviendo por su cuenta la configuración que necesita

#### Scenario: El canal queda efectivamente abierto durante el ámbito

- **WHEN** se está dentro de un ámbito de recursos de escaneo que aún no terminó
- **THEN** el canal de comunicación saliente está abierto y es utilizable para una entrega

### Requirement: El canal de comunicación se cierra al terminar el ámbito, sin excepciones

Al terminar el ámbito de recursos de escaneo, el canal de comunicación saliente SHALL cerrarse siempre. El cierre SHALL ocurrir tanto cuando el ámbito termina normalmente como cuando termina porque el trabajo interno falló, y tanto si hubo entregas como si no se realizó ninguna. Ninguna ruta de salida del ámbito SHALL dejar el canal abierto: un canal no cerrado es una fuga de descriptores de red que, acumulada, degrada el proceso entero. (HU-03-05, Unit of Work)

#### Scenario: Salida normal cierra el canal

- **WHEN** el trabajo dentro del ámbito termina sin error y el ámbito se cierra
- **THEN** el canal de comunicación saliente queda cerrado

#### Scenario: Salida por error también cierra el canal

- **WHEN** el trabajo dentro del ámbito falla y el ámbito termina por esa falla
- **THEN** el canal de comunicación saliente queda cerrado igual que en una salida normal

#### Scenario: El canal se cierra aunque no se haya entregado nada

- **WHEN** se abre un ámbito de recursos de escaneo y se cierra sin haber realizado ninguna entrega
- **THEN** el canal de comunicación saliente queda cerrado

#### Scenario: El canal se cierra aunque la falla provenga de la propia entrega

- **WHEN** una entrega dentro del ámbito señaliza indisponibilidad del orquestador y esa condición termina el ámbito
- **THEN** el canal de comunicación saliente queda cerrado

### Requirement: El ámbito no suprime los errores que ocurren dentro de él

El ámbito de recursos de escaneo SHALL limitarse a gobernar recursos: SHALL NOT capturar, silenciar, traducir ni reemplazar los errores producidos por el trabajo que ocurre dentro de él. Toda condición de error originada dentro del ámbito SHALL llegar al llamador tal como se originó, conservando su tipo y su información de diagnóstico, después de que el cierre del canal se haya efectuado. En particular, la condición de "orquestador no disponible" definida por `scan-forwarding` SHALL atravesar el ámbito sin alteración, para que la capa que la mapea a una respuesta HTTP siga teniendo exactamente un caso que manejar. (RN-WS-09, Regla de capas)

#### Scenario: El error interno llega al llamador

- **WHEN** el trabajo dentro del ámbito levanta una condición de error y el ámbito termina
- **THEN** el llamador recibe esa misma condición de error, con su tipo original, y no un éxito silencioso

#### Scenario: La condición de orquestador no disponible atraviesa el ámbito intacta

- **WHEN** una entrega dentro del ámbito señaliza indisponibilidad del orquestador
- **THEN** el llamador recibe esa misma condición de indisponibilidad, identificable por su tipo, sin envolturas ni reemplazos

#### Scenario: Cerrar el canal ocurre antes de que el error alcance al llamador

- **WHEN** el trabajo dentro del ámbito falla
- **THEN** el canal ya está cerrado en el momento en que el llamador observa la falla

### Requirement: El mecanismo de entrega se expone bajo un único punto de acceso, válido sólo dentro del ámbito

El ámbito de recursos de escaneo SHALL exponer el mecanismo de entrega al orquestador a través de **un solo** punto de acceso con nombre, de modo que el consumidor no necesite conocer ni construir nada de infraestructura. Ese punto de acceso SHALL entregar, dentro de un mismo ámbito, siempre el mismo mecanismo de entrega. Fuera del ámbito —antes de iniciarlo o después de terminarlo— el acceso SHALL fallar de forma explícita y diagnosticable, indicando que se está usando el ámbito fuera de su vigencia; SHALL NOT devolver un valor vacío ni un mecanismo apoyado sobre un canal ya cerrado. (HU-03-05, Regla de capas: Service → UoW → Repository)

#### Scenario: El punto de acceso entrega el mecanismo de entrega

- **WHEN** se accede al punto de acceso dentro de un ámbito iniciado
- **THEN** se obtiene el mecanismo de entrega al orquestador, listo para entregar un escaneo

#### Scenario: El mecanismo es estable dentro del ámbito

- **WHEN** se accede al punto de acceso dos veces dentro del mismo ámbito
- **THEN** ambas veces se obtiene el mismo mecanismo de entrega, apoyado sobre el mismo canal

#### Scenario: Acceder antes de iniciar el ámbito falla explícitamente

- **WHEN** se accede al punto de acceso sin haber iniciado el ámbito
- **THEN** el acceso falla con una condición de error explícita que indica el uso fuera de vigencia, en lugar de devolver un valor vacío

#### Scenario: Acceder después de terminar el ámbito falla explícitamente

- **WHEN** se accede al punto de acceso después de que el ámbito terminó
- **THEN** el acceso falla con la misma condición de error explícita, en lugar de devolver un mecanismo apoyado sobre un canal ya cerrado

### Requirement: La configuración del ámbito proviene del entorno y admite inyección explícita

El ámbito de recursos de escaneo SHALL obtener la configuración que necesita —el destino y la credencial del orquestador, que traslada al mecanismo de entrega— desde la configuración tipada del sistema, nunca de valores embebidos en su propio código y nunca leyendo variables de entorno por su cuenta. Cuando no se le proporciona una configuración explícita, SHALL resolver la configuración vigente del sistema. Cuando sí se le proporciona una configuración explícita, SHALL usar exactamente ésa y SHALL NOT consultar la configuración vigente del sistema. Esto permite que el uso de producción no requiera argumentos y que un uso controlado —un test, un script— fije la configuración sin manipular estado global. (RN-WS-07, Pydantic BaseSettings)

#### Scenario: Sin configuración explícita se usa la configuración vigente del sistema

- **WHEN** se abre un ámbito de recursos de escaneo sin proporcionarle configuración
- **THEN** el mecanismo de entrega construido queda apoyado sobre la configuración vigente del sistema

#### Scenario: La configuración explícita gana

- **WHEN** se abre un ámbito de recursos de escaneo proporcionándole una configuración con un destino de orquestador dado
- **THEN** la entrega realizada dentro de ese ámbito se dirige a ese destino, y no al de la configuración vigente del sistema

#### Scenario: No hay configuración embebida ni lectura directa del entorno

- **WHEN** se inspecciona el componente que gobierna el ámbito
- **THEN** no contiene ningún destino ni credencial de orquestador literal, ni ninguna lectura directa de variables de entorno

### Requirement: Cada ámbito gobierna su propio canal, aislado de los demás

Cada ámbito de recursos de escaneo SHALL abrir su propio canal de comunicación saliente. SHALL NOT existir un canal compartido de proceso ni estado global mutable entre ámbitos: terminar un ámbito SHALL NOT cerrar el canal de otro ámbito que siga vigente, y dos ámbitos simultáneos SHALL poder entregar sin interferirse. Esto garantiza que una operación de escaneo que falla no arrastre a otra que está en curso. (HU-03-05, Unit of Work)

#### Scenario: Dos ámbitos no comparten canal

- **WHEN** se abren dos ámbitos de recursos de escaneo
- **THEN** cada uno opera sobre su propio canal de comunicación saliente, distinto del otro

#### Scenario: Cerrar un ámbito no afecta a otro vigente

- **WHEN** dos ámbitos están abiertos y uno de ellos termina
- **THEN** el canal del ámbito que sigue vigente permanece abierto y utilizable

#### Scenario: Un ámbito que falló no impide abrir uno nuevo

- **WHEN** un ámbito termina por error y a continuación se abre un ámbito nuevo
- **THEN** el ámbito nuevo se inicia correctamente, con un canal propio y abierto

### Requirement: El canal abierto nunca queda sin límite de espera efectivo

El canal de comunicación saliente que abre el ámbito SHALL quedar configurado con un límite de espera por defecto, coherente con el límite que `scan-forwarding` impone a cada entrega. Ninguna operación realizada a través de ese canal SHALL poder esperar indefinidamente, aun si por algún motivo no declarara su propio límite. Este límite por defecto SHALL NOT reemplazar ni relajar la garantía de `scan-forwarding` —según la cual la entrega es dueña de su propio límite de 10 segundos y no depende de cómo esté configurado el canal— sino que la respalda como red de seguridad. (RN-WS-07, Flujo 3)

#### Scenario: El canal declara un límite de espera por defecto

- **WHEN** se inspecciona el canal abierto por el ámbito
- **THEN** declara un límite de espera por defecto, en lugar de quedar sin límite

#### Scenario: El límite por defecto coincide con el de la entrega

- **WHEN** se compara el límite por defecto del canal con el límite que la entrega impone a cada solicitud
- **THEN** ambos son el mismo valor, sin literales duplicados que puedan divergir

#### Scenario: La entrega sigue siendo dueña de su propio límite

- **WHEN** se realiza una entrega a través del canal abierto por el ámbito
- **THEN** el límite efectivo de esa entrega es el que la propia entrega declara, con el del canal actuando sólo como valor por defecto

### Requirement: El gobierno de recursos no participa del contenido ni del veredicto de la entrega

El ámbito de recursos de escaneo SHALL limitarse a abrir y cerrar recursos y a exponer el mecanismo de entrega. SHALL NOT construir, validar, completar ni transformar el mensaje de escaneo; SHALL NOT generar identificadores de escaneo; SHALL NOT interpretar la respuesta del orquestador ni decidir qué cuenta como éxito; SHALL NOT reintentar una entrega fallida. Esas responsabilidades pertenecen a `scan-payload-contract`, a la capa de lógica de negocio y a `scan-forwarding` respectivamente, y duplicarlas aquí fragmentaría la autoridad sobre el contrato. (Regla de capas: Router → Service → UoW → Repository)

#### Scenario: El ámbito no altera el mensaje entregado

- **WHEN** se entrega un mensaje de escaneo dentro del ámbito
- **THEN** el mensaje que llega al orquestador es exactamente el que el llamador proporcionó, sin campos agregados, quitados ni transformados por el gobierno de recursos

#### Scenario: El ámbito no reintenta una entrega fallida

- **WHEN** una entrega dentro del ámbito falla
- **THEN** el ámbito no emite ninguna solicitud adicional al orquestador: cierra el canal y deja propagar la falla

#### Scenario: El ámbito no decide el veredicto de la entrega

- **WHEN** el orquestador responde a una entrega realizada dentro del ámbito
- **THEN** el criterio de éxito o indisponibilidad lo aplica el mecanismo de entrega, y el ámbito no inspecciona ni reinterpreta esa respuesta

### Requirement: El gobierno de recursos es independiente del framework web

El componente que gobierna el ámbito de recursos de escaneo SHALL ser utilizable fuera del framework web: SHALL NOT depender de tipos, decoradores ni mecanismos de inyección del framework HTTP que expone la API del Bridge, ni de la librería ASGI subyacente, ni de sus middlewares. Un script de línea de comandos SHALL poder abrir un ámbito, entregar un escaneo y cerrarlo sin levantar la aplicación web. (Regla dura de capas: Router → Service → UoW → Repository)

#### Scenario: Ningún import del framework web en la capa de gobierno de recursos

- **WHEN** se inspeccionan los imports del módulo que implementa el gobierno de recursos
- **THEN** no importa el framework web de la API, ni la librería ASGI subyacente, ni la librería de rate limiting

#### Scenario: El ámbito funciona sin la aplicación web levantada

- **WHEN** se abre un ámbito de recursos de escaneo desde un contexto que no instancia la aplicación web
- **THEN** el ámbito se comporta igual: abre su canal, expone el mecanismo de entrega y cierra el canal al terminar

#### Scenario: El gobierno de recursos tampoco toca la base de datos compartida

- **WHEN** se abre, se usa y se cierra un ámbito de recursos de escaneo
- **THEN** no se abre ninguna conexión a la base de datos compartida ni se lee o escribe ninguna de sus tablas
