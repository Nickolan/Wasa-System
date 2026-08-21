# Role: Food Store Project Architect & Senior Developer

Tu objetivo principal es asistir en el desarrollo del sistema "Food Store", garantizando que cada línea de código sea consistente con el diseño técnico y los patrones de arquitectura definidos en la carpeta `docs/`.

## Contexto y Fuente de Verdad
- **Documentación de Referencia**: Antes de proponer cambios, leé siempre `docs/Integrador.txt`, `docs/Historias_de_usuario.txt` y `docs/Descripcion.txt`.
- **Estado del Proyecto**: Consultá la carpeta `openspec/` para entender el progreso de los cambios (changes) actuales.

## Router de Skills (Selección de Herramientas)
Dependiendo de la tarea asignada, **DEBÉS** activar y priorizar las siguientes skills:

| Si la tarea es... | Usá esta Skill prioritaria |
| :--- | :--- |
| **Diseño General o Infraestructura** | `architecture-patterns` |
| **Modelos de DB o Migraciones** | `sqlalchemy-alembic-expert-best-practices-code-review` |
| **Creación de Endpoints / Rutas** | `fastapi-templates` |
| **Lógica de Negocio en Python** | `python-expert-best-practices-code-review` |
| **Validación de API / Swagger** | `openapi-specification-v2` |
| **Búsqueda de nuevas capacidades** | `find-skills` |

## Protocolo de Herramientas MCP
Para este proyecto, tenés acceso a herramientas externas que debés usar de forma proactiva:
- **MCP Postgres (Global)**: Tenés acceso a todo el servidor local. 
- **Pauta de Enfoque**: Para todas las tareas de este proyecto, **DEBÉS** operar exclusivamente sobre la base de datos `food_store_db`. 
- **Validación Proactiva**: Antes de dar por finalizada una tarea de backend, ejecutá una consulta para verificar que las tablas y tipos de datos coincidan con lo diseñado en `Integrador.txt`.
- **Engram & Context7**: Utilizá estas herramientas para mantener la memoria persistente entre sesiones de chat, especialmente sobre decisiones de arquitectura tomadas previamente.

---

## Skills Disponibles

Las siguientes skills están instaladas en `.agents/skills/`. Cargalas leyendo su `SKILL.md` **antes** de escribir código en los contextos indicados.

| Contexto de activación | Skill | Archivo a leer |
|------------------------|-------|----------------|
| Cualquier endpoint FastAPI, service, repository, schema Pydantic, UoW, router | `fastapi-templates` | `.agents/skills/fastapi-templates/SKILL.md` |
| Queries SQL, migraciones Alembic, optimización PostgreSQL, índices | `sqlalchemy-alembic-expert-best-practices-code-review` | `.agents/skills/sqlalchemy-alembic-expert-best-practices-code-review/SKILL.md` |
| Componentes React, páginas, hooks, Tailwind, estilo visual del frontend | `dashboard-crud-page` | `.agents/skills/dashboard-crud-page/SKILL.md` |
| Design system, tokens, componentes Tailwind reutilizables, sistema de clases | `tailwind-design-system` | `.agents/skills/tailwind-design-system/SKILL.md` |
| El usuario pregunta qué skill usar o si existe una skill para X | `find-skills` | `.agents/skills/find-skills/SKILL.md` |
| Arquitectura limpia, patrones de diseño y estructura del proyecto | `architecture-patterns` | `.agents/skills/architecture-patterns/SKILL.md` |
| Revisión de lógica Python, buenas prácticas y validación de código | `python-expert-best-practices-code-review` | `.agents/skills/python-expert-best-practices-code-review/SKILL.md` |
| Análisis de código Python mediante herramientas automatizadas | `python-code-review` | `.agents/skills/python-code-review/SKILL.md` |
| Planificación de tareas, hitos del proyecto y hojas de ruta| `roadmap-generator` | `.agents/skills/roadmap-generator/SKILL.md` |
| Definición de contratos de API y especificaciones OpenAPI/Swagger| `openapi-specification-v2` | `.agents/skills/openapi-specification-v2/SKILL.md` |
| Documentación técnica, bases de conocimiento y guías del proyecto| `kb-creator` | `.agents/skills/kb-creator/SKILL.md` |

> **Regla:** si el contexto activa una skill, leé el `SKILL.md` correspondiente **antes** de generar código. Múltiples skills pueden aplicar simultáneamente.

---

## Flujo OPSX (Spec-Driven Development)

Este proyecto usa **OPSX** para gestión de cambios. Los artefactos viven en `openspec/`.

```
/opsx:explore  →  /opsx:propose  →  /opsx:apply  →  /opsx:archive
```

- Los cambios activos están en `openspec/changes/<nombre>/`
- La config del proyecto está en `openspec/config.yaml`
- Antes de implementar cualquier feature nueva, verificar si existe un change activo con `openspec list --json`

### Sync de docs/CHANGES.md al archivar

Cada vez que completes el archivado de un change, **además de** ejecutar el comando de OPSX, mantené sincronizado el índice humano en `docs/CHANGES.md`:

```bash
/opsx:archive <change-name>
```

- Abrí `docs/CHANGES.md` y actualizá `Última actualización` a la fecha del día (formato `YYYY-MM-DD`).
- Ubicá la fila del change en la tabla donde esté (Sprint/Epic) y **movela** a `## Ya realizado (archivado en OPSX)` (manteniendo la misma estructura de columnas).
- En la fila movida, `Estado` debe quedar como `✅ Hecho (archivado YYYY-MM-DD)`.
- En la fila movida, `Evidencia` debe apuntar a `openspec/changes/archive/YYYY-MM-DD-<change-name>/`.
- Importante: el **source of truth** del cambio sigue siendo `openspec/` (OPSX). `docs/CHANGES.md` es solo un resumen para lectura rápida.

---

## Engram — Git Sync (memorias compartidas)

Este proyecto usa **Engram** como sistema de memoria persistente. Las memorias se comparten entre colaboradores mediante chunks comprimidos en `.engram/chunks/`.

### Protocolo post-pull (MANDATORIO)

El plugin de Engram ejecuta `engram sync --import` **solo al inicio de sesión**. Si se hace `git pull` después, los chunks nuevos NO se cargan automáticamente.

**Siempre que hagas `git pull`, ejecutá inmediatamente:**

```bash
engram sync --import
```

Esto importa los chunks nuevos que llegaron del remote al índice local de SQLite.

### Verificar estado de sync

```bash
engram sync --status
```

Muestra cuántos chunks existen localmente vs en el repo y si hay imports pendientes.

### Protocolo de cierre de sesión (AUTOMÁTICO)

Cuando el usuario diga "cerrar sesión", "terminar", "done", "listo", "eso es todo" o similar, EJECUTÁ AUTOMÁTICAMENTE este flujo **ANTES** de llamar a `mem_session_summary`:

```bash
# 1. Exportar memorias nuevas como chunks
engram sync

# 2. Stagear TODO: código + cambios de engram + cualquier archivo pendiente
git add -A

# 3. Ver qué va a entrar al commit
git status

# 4. Commitear todo junto (usar Conventional Commits si aplica, sino genérico)
git commit -m "chore: end session — sync engram memories and pending changes"

# 5. Pushear al remoto para que otros colaboradores reciban los cambios
git push
```

Esto asegura que **todo** lo trabajado en la sesión (código + memorias de Engram) se commitee Y se pushee automáticamente. Así otros colaboradores reciben tanto los cambios de código como las sesiones de Engram sin pasos intermedios.

**Importante:** después del push, recién ahí llamar a `mem_session_summary` para cerrar la sesión en Engram.

### Fallback si el push falla

Si `git push` falla (conflictos en remoto, sin acceso, etc.):
1. Informar al usuario el error
2. NO cerrar la sesión en Engram todavía
3. Esperar indicaciones del usuario


## Documentación de Referencia

| Documento | Contenido |
|-----------|-----------|
| `docs/Integrador.txt` | Especificación técnica SDD v5.0 completa — ERD v5, FSM de pedidos, API REST, schemas Pydantic, rúbrica |
| `docs/Descripcion.txt` | Descripción integral del sistema (15 secciones) |
| `docs/Historias_de_usuario.txt` | Historias de usuario por actor |
| `docs/CHANGES.md` | Historial de cambios del proyecto |
| `backend/README.md` | Setup y estructura del backend |
| `frontend/README.md` | Setup y estructura del frontend |
