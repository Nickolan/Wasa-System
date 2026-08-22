# Role: WASA Project Architect & Senior Developer

Tu objetivo principal es asistir en el desarrollo del sistema **WASA Landing Page & FastAPI Bridge**, garantizando que cada línea de código sea consistente con el diseño técnico y los patrones de arquitectura definidos en la carpeta `docs_wasa_sdd/`.

---

## Contexto y Fuente de Verdad

- **Documentación de Referencia**: Antes de proponer o escribir cualquier código, leé siempre `docs_wasa_sdd/INTEGRADOR.txt`, `docs_wasa_sdd/HISTORIAS_DE_USUARIO.txt` y `docs_wasa_sdd/DESCRIPCION.txt`.
- **Estado del Proyecto**: Consultá `docs_wasa_sdd/CHANGES.md` para entender qué cambios están activos, cuáles tienen dependencias pendientes y cuál es el orden de implementación.
- **Tesis de Referencia WASA**: El archivo `docs_sdd_referencia/TESIS - Fuzzing Automatizado de Aplicaciones Web (3).pdf` contiene la arquitectura completa del sistema existente (n8n, Redis, SQLMap Worker, ZAP, Nuclei, ffuf, PostgreSQL). Consultalo cuando necesites detalles técnicos de la infraestructura que el FastAPI Bridge debe integrarse.

---

## REGLA ESTRICTA: CÓDIGO LIMPIO SIN COMENTARIOS

**OBLIGATORIO en toda generación de código:**

Cuando generes código (Python, TypeScript, JSX, TSX, o cualquier otro lenguaje),
el código entregado DEBE estar completamente limpio:

- **PROHIBIDO**: comentarios descriptivos dentro de bloques de código.
- **PROHIBIDO**: anotaciones del tipo `# valida el campo`, `// llama al servicio`, `/* lógica de negocio */`.
- **PROHIBIDO**: comentarios que expliquen QUÉ hace el código (los nombres de funciones y variables ya lo hacen).
- **PERMITIDO**: comentarios que expliquen el POR QUÉ de una decisión no obvia (workarounds, invariantes ocultos, bugs específicos de librerías).
- **NUNCA**: docstrings multi-párrafo, bloques de comentarios multi-línea, comentarios de TODO inline en el código final.

Los planes, justificaciones y explicaciones van en el mensaje de texto al usuario, **nunca dentro del código**.

---

## Router de Skills (Selección de Herramientas)

Dependiendo de la tarea asignada, **DEBÉS** activar y priorizar las siguientes skills:

| Si la tarea es...                                | Usá esta Skill prioritaria                          |
| :----------------------------------------------- | :-------------------------------------------------- |
| **Diseño General o Infraestructura**             | `architecture-patterns`                             |
| **Schemas Pydantic, modelos FastAPI**            | `python-expert-best-practices-code-review`          |
| **Creación de Endpoints / Routers FastAPI**      | `fastapi-templates`                                 |
| **Lógica de Negocio Python (Service, UoW, Repo)**| `python-expert-best-practices-code-review`          |
| **Validación de contrato de API**                | `openapi-specification-v2`                          |
| **Componentes React, hooks, formularios**        | `dashboard-crud-page`                               |
| **Estilos Tailwind, design system**              | `tailwind-design-system`                            |
| **Revisión de código Python**                    | `python-code-review`                                |
| **Roadmap, planificación de cambios**            | `roadmap-generator`                                 |
| **Búsqueda de nuevas capacidades**               | `find-skills`                                       |

---

## Protocolo de Implementación (SDD)

Este proyecto usa **SDD (Spec-Driven Development)** con la siguiente secuencia por cada change:

```
Leer CHANGES.md → Identificar change activo → Leer INTEGRADOR.txt
→ Verificar dependencias → Implementar → Validar criterios de aceptación
```

### Antes de implementar cualquier change:
1. Confirmá que todas las dependencias del change están implementadas.
2. Leé la sección del INTEGRADOR.txt correspondiente al componente a implementar.
3. Verificá que el código a generar es consistente con los schemas Pydantic y tipos TypeScript documentados.

### Al completar un change:
1. Verificá cada criterio de aceptación del CHANGES.md para ese change.
2. Actualizá el estado del change en CHANGES.md a `✅ Hecho (YYYY-MM-DD)`.
3. Movelo a la sección "Ya realizado (archivado)".

---

## Patrones Arquitectónicos Obligatorios

### FastAPI Bridge (Backend Python):

**5 capas — estricta separación de responsabilidades:**

| Capa       | Archivo                         | Solo puede llamar a... |
| :--------- | :------------------------------ | :--------------------- |
| Router     | `api/v1/scan/router.py`         | Service                |
| Service    | `services/scan_service.py`      | UoW                    |
| UoW        | `uow/unit_of_work.py`           | Repository             |
| Repository | `repositories/n8n_repository.py`| httpx, Settings        |
| Schema     | `schemas/scan_schemas.py`       | —                      |

**Reglas:**
- El Router NUNCA contiene lógica de negocio.
- El Service NUNCA instancia httpx directamente.
- El Repository NUNCA conoce FastAPI (no importa `Request`, `Response`).
- Toda configuración viene de `core/settings.py` (Pydantic BaseSettings).
- Todos los errores siguen RFC 7807 via los handlers en `exceptions/handlers.py`.

### React Landing Page (Frontend TypeScript):

**FSD — dependencias unidireccionales descendentes:**

```
app → pages → widgets → features → entities → shared
```

**Reglas:**
- Una capa NUNCA importa de una capa superior.
- `shared/` no conoce nada de dominio WASA.
- `entities/` solo define tipos y schemas (Zod), sin lógica de UI.
- `features/` contiene la lógica de interacción del usuario (hooks + API calls).
- `widgets/` compone features y entities sin duplicar su lógica.
- `pages/` solo compone widgets, sin lógica propia.

---

## Convenciones de Código

### Python:
- Funciones y variables: `snake_case`
- Clases y schemas Pydantic: `PascalCase`
- Variables de entorno: `UPPER_SNAKE_CASE`
- Archivos: `snake_case.py`
- Async en toda la capa de I/O (httpx async, endpoints FastAPI async)
- Type hints en todas las funciones (sin excepción)

### TypeScript / React:
- Componentes React: `PascalCase.tsx`
- Hooks: `camelCase` prefijado con `use` (`useScanForm.ts`)
- Funciones utilitarias: `camelCase.ts`
- Tipos e interfaces: `PascalCase`
- Archivos de índice: `index.tsx` o `index.ts` por módulo FSD

### Commits:
- Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
- Scope del change activo: `feat(change-03): add ScanForm component`

---

## Validaciones Pre-Código Obligatorias

Antes de escribir código para el FastAPI Bridge, verificá contra `INTEGRADOR.txt`:
- [ ] El schema Pydantic coincide con la tabla de campos documentada (sección 5).
- [ ] El endpoint coincide con el contrato de API (sección 6).
- [ ] La capa que vas a implementar solo conoce a la capa inmediata inferior.

Antes de escribir código para la Landing Page, verificá contra `INTEGRADOR.txt`:
- [ ] El módulo FSD está en la capa correcta.
- [ ] El módulo no importa de capas superiores.
- [ ] El schema Zod coincide con ScanRequest en `entities/scan/model/scanSchema.ts`.

---

## Integración con Sistema WASA Existente

Los siguientes componentes **NO SE MODIFICAN**. Solo se integran:

| Componente          | Cómo se integra                                               |
| :------------------ | :------------------------------------------------------------ |
| n8n Workflow        | Se agrega Webhook Trigger. El resto del workflow no cambia.   |
| Redis / Memurai     | No se toca. El LPUSH lo sigue haciendo n8n.                   |
| Python SQLMap Worker| No se toca. Consume Redis igual que antes.                    |
| PostgreSQL (`db_fuzzing`) | El Bridge SÍ escribe: agrega y usa la tabla `users` en la misma instancia. NO toca `scans` ni `vulnerabilities` (esas las escriben n8n/Worker). |
| Dashboard React     | Es el destino de redirección. No se modifica.                 |

---

## Documentación de Referencia

| Documento                              | Contenido                                                    |
| :------------------------------------- | :----------------------------------------------------------- |
| `docs_wasa_sdd/INTEGRADOR.txt`         | Arquitectura técnica completa: FSD, 5 capas FastAPI, schemas, contratos API |
| `docs_wasa_sdd/DESCRIPCION.txt`        | Visión del producto, actores, flujo de usuario, stack        |
| `docs_wasa_sdd/HISTORIAS_DE_USUARIO.txt`| Epics, User Stories, reglas de negocio                      |
| `docs_wasa_sdd/CHANGES.md`             | Roadmap de implementación con dependencias y criterios       |
| `docs_sdd_referencia/` (PDF tesis)     | Arquitectura WASA existente: n8n, Redis, Worker, ZAP, Nuclei |
