## Context

Ver `proposal.md` — Why para la motivación, y `specs/scan-payload-contract/spec.md` para los requirements normativos. Este documento cubre únicamente el *cómo*.

Estado actual verificado en el repo:

- `fastapi_bridge/schemas/scan_schemas.py` existe pero es un docstring placeholder del scaffold de CHANGE-00a. **Nadie lo importa todavía** (`api/v1/scan/router.py` no lo referencia), así que reemplazar su contenido no rompe nada.
- El placeholder dice literalmente *"Se implementa en CHANGE-12"*, lo cual contradice `CHANGES.md`, donde estos schemas son CHANGE-08 y CHANGE-12 solo los consume. El docstring del scaffold es el que está desactualizado; la referencia correcta es CHANGE-08. Al reescribir el archivo el conflicto desaparece.
- `fastapi_bridge/schemas/auth_schemas.py` establece la convención de casa: módulo con docstring en español, una línea de responsabilidad, referencia al change que lo implementa. `scan_schemas.py` la sigue.
- Entorno: Pydantic **2.12.5** (`pydantic[email]>=2.0` en `requirements.txt`), pytest 8 con `pytest.ini` apuntando a `testpaths = fastapi_bridge/tests`. No hace falta agregar ninguna dependencia.

Restricciones del proyecto que condicionan el diseño:

- Reglas duras de `CLAUDE.md`: `PascalCase` para schemas Pydantic, `snake_case` para campos y archivos, type hints obligatorios. Los schemas no importan nada de FastAPI ni de SQLAlchemy — son datos puros.
- Compact rules de la skill `pydantic`: `BaseModel` solo para datos externos/no confiables (es exactamente el caso), constraints built-in por sobre `@field_validator` propios, patrón `Annotated`, nada de `from __future__ import annotations` en módulos con modelos Pydantic, evitar uniones tipo `int | str` y colecciones abstractas.
- Governance **BAJO**: sin persistencia, sin auth, sin red. Autonomía plena con tests verdes.

## Goals / Non-Goals

**Goals:**

- Que las cuatro reglas de negocio del payload (RN-WS-02..05) queden expresadas de forma **declarativa** en el tipo, no en código imperativo de validación: si una regla cambia, cambia una anotación, no una función.
- Que `ScanRequest` sea la única puerta de entrada de datos de escaneo, de modo que los changes 09-12 puedan asumir que todo lo que reciben ya es válido y no revalidar nada.
- Que el error de validación producido sea consumible tal cual por el handler RFC 7807 de CHANGE-07 (`exceptions/handlers.py`), sin formato intermedio propio.
- Que `N8nPayload` sea serializable a JSON sin transformaciones en el punto de envío, para que `N8nRepository.forward_scan` (CHANGE-09) sea trivial.

**Non-Goals:**

- No se monta ni se toca ningún router, service, UoW ni repository. El endpoint `/api/v1/scan/start` queda como está.
- No se genera el `scan_id`. La generación del UUID es responsabilidad de `ScanService` (CHANGE-11); acá solo se declara el campo que lo transporta.
- No se implementa el mapeo `ScanRequest → N8nPayload` como código de producción (ver D-6). Vive en el Service.
- No se valida contenido semántico del `phpsessid` (formato de token de sesión PHP, longitud típica de 26/32 chars, alfabeto). El Bridge no conoce el formato de sesión de la app objetivo.
- No se valida que la `target_url` sea alcanzable, ni que el usuario esté autorizado a escanearla. La autorización ética es declarativa y vive en el frontend (RN-WS-01, HU-02-05).
- No se agrega `ErrorDetail`, aunque el docstring del placeholder lo mencione: el formato de error es RFC 7807 y lo posee CHANGE-07, no este contrato.

## Decisions

### D-1 — `HttpUrl` para `target_url` en vez de `str` + validador de esquema

`target_url: HttpUrl`. El tipo `HttpUrl` de Pydantic v2 ya restringe el esquema a `http`/`https` (`UrlConstraints(allowed_schemes=["http", "https"])`) y exige una URL absoluta y bien formada. Eso cubre RN-WS-02 completo sin escribir un solo validador.

- *Alternativa descartada*: `str` con `@field_validator` que chequee `startswith(("http://", "https://"))`. Rechazada por dos razones: la compact rule de la skill `pydantic` prioriza constraints built-in sobre validadores propios, y un `startswith` acepta basura como `https://` a secas o `http://???`, que `HttpUrl` sí rechaza.
- *Alternativa descartada*: `AnyUrl`. Acepta cualquier esquema (`ftp://`, `file://`), lo que viola RN-WS-02 y abriría un vector de SSRF hacia el worker de SQLMap.
- *Consecuencia a tener presente*: en Pydantic ≥2.10 `HttpUrl` **normaliza** — `https://example.com` se valida como `https://example.com/` (barra final añadida al host desnudo). Es determinístico y está especificado como escenario en el spec, pero los tests deben comparar contra la forma normalizada, no contra el literal de entrada. Además, el valor resultante es un objeto `HttpUrl`, **no** un `str`: `isinstance(req.target_url, str)` es `False`. De ahí D-5.

### D-2 — `phpsessid` con `StringConstraints(strip_whitespace=True, min_length=1)`

RN-WS-03 exige rechazar tanto la cadena vacía como la que contiene solo espacios. `min_length=1` a secas —que es lo que literalmente pide el scope de `CHANGES.md`— **no alcanza**: `"   "` tiene longitud 3 y pasaría.

La solución es `Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]`. En pydantic-core el strip se aplica **antes** de evaluar la longitud, de modo que `"   "` se convierte en `""` y falla `min_length=1`. Con una sola anotación se cubren los tres casos de RN-WS-03 (vacío, solo espacios, ausente) sin validador propio.

- *Alternativa descartada*: `@field_validator(mode="after")` que haga `v.strip()` y levante si queda vacío. Funciona, pero es código imperativo para algo que el tipo ya expresa; contradice la compact rule de constraints built-in.
- *Alternativa descartada*: `min_length=1` sin strip, aceptando el hueco. Rechazada: RN-WS-03 es explícita y hay un criterio de aceptación dedicado.
- *Efecto secundario deliberado*: el strip **normaliza** el valor. `"  abc  "` se guarda como `"abc"` y es esa forma limpia la que viaja a n8n. Es deseable: evita que un copy-paste con espacios rompa el escaneo aguas abajo.

### D-3 — Constraints en `Annotated`, defaults por asignación

Patrón adoptado para los dos enteros:

```
sqlmap_level: Annotated[int, Field(ge=1, le=5)] = 1
sqlmap_risk: Annotated[int, Field(ge=1, le=3)] = 1
```

Es decir: la **restricción** vive dentro del `Annotated` (patrón preferido por la skill `pydantic`), y el **default** va por asignación, que es la forma que la propia skill señala como necesaria para `default`/`default_factory`/`alias`. Meter el default dentro del `Field()` del `Annotated` también funciona en runtime, pero deja el valor por defecto invisible para los type checkers y contradice la regla; se descarta por consistencia.

`ge`/`le` (no `gt`/`lt`) porque los rangos de RN-WS-04 y RN-WS-05 son **inclusivos**: 1 y 5 son niveles válidos, 1 y 3 son riesgos válidos.

No hay clamping. HU-02-04 menciona "clamping a rango" pero eso es comportamiento de **UX del formulario** (CHANGE-16): el input numérico no deja escribir 6. El backend, en cambio, **rechaza** — un cliente que no sea el formulario oficial no puede colar un nivel 7. El criterio de aceptación "`sqlmap_level=6` falla validación" lo confirma.

### D-4 — `Literal["queued"]` para el estado de la respuesta

`status: Literal["queued"]` en `ScanResponse`. El endpoint es *fire-and-forward* (RN-WS-07): el Bridge nunca conoce el resultado del escaneo, solo confirma que lo encoló. Un `str` libre invitaría a que algún día alguien devuelva `"running"` o `"failed"` desde ahí y rompa el contrato con el frontend. `Literal` lo hace imposible por tipo.

- *Alternativa descartada*: un `StrEnum` `ScanStatus`. Sería lo correcto si el sistema tuviera un ciclo de vida de estados que esta API expone; no lo tiene — el estado del escaneo lo consulta el Dashboard existente, fuera del alcance del Bridge. Un enum de un solo miembro es ceremonia sin beneficio.
- El default: `status` queda **requerido**, sin default. Un `= "queued"` haría que se pueda construir la respuesta sin pensar; explícito es mejor y el Service lo pasa siempre.

### D-5 — `N8nPayload.target_url` es `str`, no `HttpUrl`

`ScanRequest.target_url` es `HttpUrl` (objeto), `N8nPayload.target_url` es `str`. La asimetría es intencional:

- `ScanRequest` es el **borde de entrada**: ahí queremos el máximo de validación.
- `N8nPayload` es el **borde de salida** hacia un sistema que espera JSON plano. Con `str`, `model_dump()` y `model_dump_json()` producen directamente la cadena de la URL, sin necesidad de `mode="json"` ni de serializadores custom en `N8nRepository`.

La conversión es `str(request.target_url)` y ocurre en el Service (CHANGE-11). Queda documentada acá para que CHANGE-11 no la improvise.

- *Alternativa descartada*: `HttpUrl` también en `N8nPayload`, dejando que el repository haga `model_dump(mode="json")`. Traslada una sutileza de serialización a la capa de red, que es donde menos se quiere pensar en tipos.
- *Riesgo aceptado*: `N8nPayload` no revalida el esquema de la URL. Es aceptable porque, por contrato, solo se construye a partir de un `ScanRequest` ya validado (escenario "El mensaje se deriva de una solicitud validada" en el spec).

### D-6 — Los schemas son datos puros: sin factory `from_request`, sin lógica

Se evaluó agregar `N8nPayload.from_request(req, scan_id)` como classmethod de conveniencia. Se descarta: la regla dura del proyecto pone toda la lógica en el Service, y el mapeo —incluida la conversión de D-5— es precisamente la clase de decisión que debe verse en `ScanService`. Los tres schemas quedan como declaraciones de forma, sin métodos.

La compatibilidad entre `ScanRequest` y `N8nPayload` (que uno pueda alimentar al otro sin pérdida) **sí** se verifica en los tests de este change, construyendo el payload explícitamente en el test. Es una aserción sobre el contrato, no código de producción.

### D-7 — `extra="ignore"` explícito en `ScanRequest`

`model_config = ConfigDict(extra="ignore")`, declarado aunque sea el default de Pydantic, para dejar la decisión visible en el archivo.

El razonamiento: el formulario de la landing (HU-02-05) incluye un checkbox de aceptación ética que **no** forma parte del contrato del backend. Si un cliente serializa el formulario completo, un `extra="forbid"` devolvería 422 por un campo que no le importa a nadie, y sería un fallo confuso de diagnosticar.

- *Alternativa evaluada seriamente*: `extra="forbid"`, que como defensa en profundidad evitaría "parameter smuggling" hacia el worker. Se descarta porque el smuggling **ya es imposible**: `N8nPayload` declara exactamente cinco campos, y ningún campo desconocido de la entrada puede aparecer ahí. La protección real está en el borde de salida, no en el de entrada. Ese es el requirement "Los campos desconocidos no se propagan al orquestador" del spec.

### D-8 — `scan_id: str` sin restricción de formato

Tanto en `ScanResponse` como en `N8nPayload`, `scan_id` es un `str` requerido y sin constraints. HU-03-05 dice que es un UUID, pero el generador vive en CHANGE-11.

- *Alternativa descartada*: `uuid.UUID`. Ataría el contrato a una estrategia de identificador concreta y obligaría a convertir a `str` al serializar hacia n8n y hacia el cliente — el mismo problema de D-5, sin ganancia real.
- *Alternativa descartada*: `min_length=1`. Marginal; el campo lo produce el propio Bridge, no un cliente no confiable, así que no hay superficie de ataque que proteger. Se prefiere el tipo más simple que satisface el spec.

### D-9 — Un único archivo de tests, sin fixtures compartidas

`fastapi_bridge/tests/test_scan_schemas.py`, siguiendo el estilo de `test_settings.py`: funciones `test_*` planas, docstring de módulo en español nombrando la capability, aserciones directas. Para los casos inválidos se usa `pytest.raises(ValidationError)` y se inspecciona `exc_info.value.errors()` para confirmar que el `loc` señala el campo esperado — eso es lo que hace verificable el requirement de "reporta cada campo inválido", en vez de un `raises` ciego que pasaría por el motivo equivocado.

No se agregan `conftest.py` ni fixtures: los modelos se construyen inline, no hay estado que compartir.

## Risks / Trade-offs

- **La normalización de `HttpUrl` sorprende a quien escriba los tests** (`https://example.com` → `https://example.com/`) → mitigado con un escenario dedicado en el spec, la tarea de test correspondiente, y este documento. Comparar siempre contra la forma normalizada.
- **`ScanRequest.target_url` no es un `str`** y un `str(...)` olvidado en CHANGE-11 haría fallar la validación de `N8nPayload` con un error poco obvio → mitigado por D-5 documentado + el test de compatibilidad entre ambos schemas, que falla ruidosamente si alguien cambia el tipo de un lado.
- **El strip de `phpsessid` altera el dato del usuario** (D-2) → es deliberado y está en el spec como escenario. Si en el futuro apareciera una app objetivo cuyo PHPSESSID tenga espacios significativos, habría que revisarlo; hoy no existe ese caso y los tokens de sesión PHP son alfanuméricos.
- **Divergencia entre la validación Zod del frontend (CHANGE-16) y estos rangos** → riesgo real de drift. Mitigación: el backend es la autoridad; el spec de esta capability es el documento contra el cual CHANGE-16 debe escribirse. Anotado en el Impact del proposal.
- **`extra="ignore"` deja pasar typos silenciosamente** — un cliente que mande `sqlmaplevel` en vez de `sqlmap_level` recibe 200 con nivel 1, no un 422 → aceptado conscientemente (D-7). El costo de un escaneo con nivel por defecto es bajo; el costo de rechazar formularios legítimos es alto.
- **`CHANGES.md` no marca CHANGE-08 como hecho al terminar** → tarea explícita en `tasks.md`; sin eso, la línea `[ ]` del roadmap queda mintiendo.

## Migration Plan

No aplica en sentido estricto: no hay datos que migrar, ni esquema de base de datos, ni contrato HTTP publicado que rompa. Se reemplaza el contenido de un módulo placeholder que ningún otro módulo importa.

Rollback: revertir `fastapi_bridge/schemas/scan_schemas.py` a su docstring y borrar `test_scan_schemas.py`. Cero efectos colaterales — ninguna otra parte del sistema depende todavía de estos tipos.
