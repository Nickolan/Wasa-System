## ADDED Requirements

### Requirement: Montar la Landing completa no ensucia la consola

Montar la aplicación con la Landing completa —sus cinco secciones, sus modales de autenticación y la restauración de sesión al montar— SHALL NOT emitir ningún error ni ninguna advertencia por la consola del agente de usuario.

Esto SHALL valer tanto para un visitante sin sesión como para uno con sesión persistida vigente, y SHALL valer también bajo el doble montaje de efectos del modo estricto de React.

La condición SHALL verificarse de forma automatizada, de modo que una regresión futura que reintroduzca un aviso de consola falle la suite en lugar de pasar inadvertida.

Quedan fuera de esta garantía los mensajes que emita el propio entorno de desarrollo o las herramientas del navegador sin originarse en el código de la aplicación.

#### Scenario: Sin sesión, la consola queda limpia

- **WHEN** se monta la aplicación completa sin sesión persistida
- **THEN** no se emite ningún error ni advertencia por consola

#### Scenario: Con sesión, la consola queda limpia

- **WHEN** se monta la aplicación completa con una sesión persistida vigente
- **THEN** no se emite ningún error ni advertencia por consola

#### Scenario: El doble montaje del modo estricto tampoco avisa

- **WHEN** se monta la aplicación bajo el modo estricto de React, que ejecuta los efectos dos veces
- **THEN** no se emite ningún error ni advertencia por consola

#### Scenario: Una regresión falla la suite

- **WHEN** se introduce deliberadamente un aviso de consola al montar la Landing
- **THEN** la suite de tests falla identificando el aviso
