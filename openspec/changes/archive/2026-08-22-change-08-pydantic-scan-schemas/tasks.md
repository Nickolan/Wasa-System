# Tasks — change-08-pydantic-scan-schemas

> Strict TDD activo. Cada grupo 2..7 es un ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR**:
> el test se escribe y se ejecuta *antes* que el código de producción que lo satisface.
> Referencias: `specs/scan-payload-contract/spec.md` (qué), `design.md` D-1..D-9 (cómo).
> Solo se tocan dos archivos: `fastapi_bridge/schemas/scan_schemas.py` y
> `fastapi_bridge/tests/test_scan_schemas.py`. Nada más del repo se modifica.

## 1. Safety net y preparación

- [x] 1.1 Ejecutar `pytest` completo y anotar el baseline (`N passed`); si algo ya falla, reportarlo como fallo preexistente y NO arreglarlo en este change
- [x] 1.2 Confirmar que `fastapi_bridge/schemas/scan_schemas.py` es solo el docstring placeholder y que ningún módulo lo importa — verificar con una búsqueda de `scan_schemas` en `fastapi_bridge/` que no arroje importadores
- [x] 1.3 Crear `fastapi_bridge/tests/test_scan_schemas.py` con el docstring de módulo en español al estilo de `test_settings.py` y el import de `ValidationError` de `pydantic`; verificar que `pytest fastapi_bridge/tests/test_scan_schemas.py` recolecta el archivo sin errores de import

## 2. ScanRequest — URL objetivo (RN-WS-02, D-1)

- [x] 2.1 RED: escribir el test del caso válido `https://example.com/login.php` importando `ScanRequest` desde `fastapi_bridge.schemas.scan_schemas`; ejecutar y verificar que falla con `ImportError`/`ModuleNotFoundError` porque el schema todavía no existe
- [x] 2.2 GREEN: crear `ScanRequest(BaseModel)` con `target_url: HttpUrl` y `phpsessid: str` (los enteros aún no); ejecutar y verificar que el test de 2.1 pasa
- [x] 2.3 TRIANGULATE: agregar tests para `http://` con query string, URL sin esquema, esquema no HTTP (`ftp://`, `file://`), cadena vacía y texto arbitrario — cada caso inválido con `pytest.raises(ValidationError)` comprobando que algún error tiene `loc == ("target_url",)`; ejecutar y verificar que todos pasan sin tocar el código de producción
- [x] 2.4 TRIANGULATE: agregar el test de normalización determinística (`https://example.com` produce la misma representación textual que `https://example.com/`, con `str(...)`); ejecutar y verificar que pasa, dejando la normalización de Pydantic ≥2.10 documentada en el propio test

## 3. ScanRequest — PHPSESSID (RN-WS-03, D-2)

- [x] 3.1 RED: escribir el test de PHPSESSID vacío (`""`) esperando `ValidationError` con `loc == ("phpsessid",)`; ejecutar y verificar que falla porque el `str` desnudo actual lo acepta
- [x] 3.2 GREEN: anotar `phpsessid: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]`; ejecutar y verificar que el test de 3.1 pasa
- [x] 3.3 TRIANGULATE: agregar tests para solo espacios (`"   "` → rechazado), campo ausente (→ rechazado como requerido), valor normal (→ aceptado) y `"  a1b2c3  "` (→ aceptado y normalizado a `"a1b2c3"`); ejecutar y verificar que los cuatro pasan sin cambiar el código de producción
- [x] 3.4 Verificar explícitamente en el test de solo-espacios que un `min_length=1` sin `strip_whitespace` NO habría bastado — dejar el motivo en el nombre del test o en un comentario, para que nadie "simplifique" la anotación después

## 4. ScanRequest — parámetros de SQLMap (RN-WS-04, RN-WS-05, D-3)

- [x] 4.1 RED: escribir el test de `sqlmap_level=6` esperando `ValidationError` con `loc == ("sqlmap_level",)`; ejecutar y verificar que falla porque el campo aún no existe
- [x] 4.2 GREEN: agregar `sqlmap_level: Annotated[int, Field(ge=1, le=5)] = 1`; ejecutar y verificar que el test de 4.1 pasa
- [x] 4.3 TRIANGULATE: agregar tests de nivel para los extremos válidos (1 y 5), un valor intermedio (3), `0` y negativo (→ rechazados), omisión (→ resultado `1`) y valor no entero (`"alto"`, `2.5` → rechazados); ejecutar y verificar que todos pasan
- [x] 4.4 RED: escribir el test de `sqlmap_risk=4` esperando `ValidationError` con `loc == ("sqlmap_risk",)`; ejecutar y verificar que falla
- [x] 4.5 GREEN: agregar `sqlmap_risk: Annotated[int, Field(ge=1, le=3)] = 1`; ejecutar y verificar que el test de 4.4 pasa
- [x] 4.6 TRIANGULATE: agregar tests de riesgo para extremos válidos (1 y 3), `0`/negativo (→ rechazados) y omisión (→ resultado `1`); ejecutar y verificar que todos pasan
- [x] 4.7 Agregar un test que confirme que NO hay clamping: `sqlmap_level=6` levanta en vez de producir `5`, y `sqlmap_risk=4` levanta en vez de producir `3` (D-3); ejecutar y verificar que pasa

## 5. ScanRequest — comportamiento agregado (D-7)

- [x] 5.1 RED/GREEN: escribir el test de solicitud mínima válida (solo `target_url` + `phpsessid`) que afirme `sqlmap_level == 1` y `sqlmap_risk == 1`; ejecutar y verificar que pasa con el código ya escrito (confirma que los defaults del grupo 4 quedaron bien puestos)
- [x] 5.2 RED: escribir el test de múltiples campos inválidos a la vez (URL sin esquema + PHPSESSID vacío + nivel `9`) afirmando que `exc_info.value.errors()` contiene una entrada para cada uno de los tres `loc`; ejecutar y verificar el resultado
- [x] 5.3 RED: escribir el test de campo desconocido (por ejemplo `acepta_terminos: True` junto a datos válidos) afirmando que la validación tiene éxito y que el campo no aparece en `model_dump()`; ejecutar y verificar
- [x] 5.4 GREEN: declarar `model_config = ConfigDict(extra="ignore")` explícitamente en `ScanRequest` con un comentario que remita a D-7; ejecutar y verificar que 5.3 sigue pasando

## 6. ScanResponse (D-4)

- [x] 6.1 RED: escribir el test de respuesta válida (`scan_id`, `status="queued"`, `message`) importando `ScanResponse`; ejecutar y verificar que falla porque el schema no existe
- [x] 6.2 GREEN: crear `ScanResponse(BaseModel)` con `scan_id: str`, `status: Literal["queued"]` y `message: str`, los tres requeridos y sin default (D-4, D-8); ejecutar y verificar que el test de 6.1 pasa
- [x] 6.3 TRIANGULATE: agregar tests para un estado distinto de `queued` (`"running"`, `"failed"` → rechazados con `loc == ("status",)`) y para la omisión de cada uno de los tres campos (→ error de campo requerido); ejecutar y verificar que todos pasan

## 7. N8nPayload (D-5, D-6, D-8)

- [x] 7.1 RED: escribir el test de payload completo con los cinco campos importando `N8nPayload`; ejecutar y verificar que falla porque el schema no existe
- [x] 7.2 GREEN: crear `N8nPayload(BaseModel)` con `target_url: str`, `phpsessid: str`, `sqlmap_level: int`, `sqlmap_risk: int`, `scan_id: str`, todos requeridos; ejecutar y verificar que el test de 7.1 pasa
- [x] 7.3 TRIANGULATE: agregar el test de omisión de `scan_id` (→ error de campo requerido) y el test de serialización, afirmando que `model_dump()` tiene exactamente las cinco claves esperadas y que `target_url` es una `str` (no un objeto URL); ejecutar y verificar que pasan
- [x] 7.4 TRIANGULATE: agregar el test de compatibilidad entre contratos — construir un `ScanRequest` mínimo válido, derivar el `N8nPayload` explícitamente en el test con `str(request.target_url)` y un `scan_id` de prueba, y afirmar que los cuatro parámetros coinciden con los valores validados, incluidos los defaults aplicados y el `phpsessid` ya normalizado; ejecutar y verificar que pasa
- [x] 7.5 Confirmar por revisión del archivo que `N8nPayload` NO tiene ningún método ni classmethod `from_request` (D-6): los tres schemas son declaraciones de forma, el mapeo vive en `ScanService` (CHANGE-11)

## 8. REFACTOR y cierre

- [x] 8.1 REFACTOR: reescribir el docstring de módulo de `scan_schemas.py` — hoy dice "Se implementa en CHANGE-12", que contradice `CHANGES.md`; debe nombrar a CHANGE-08 y las tres clases reales, siguiendo el estilo de `auth_schemas.py`. Ejecutar los tests tras el cambio y verificar que siguen verdes
- [x] 8.2 REFACTOR: revisar imports (sin `from __future__ import annotations`, sin importar nada de FastAPI ni SQLAlchemy) y ordenarlos; agrupar la clase por orden de dependencia lógica (`ScanRequest`, `ScanResponse`, `N8nPayload`) con docstring por clase citando su regla de negocio. Ejecutar los tests y verificar que siguen verdes
- [x] 8.3 Verificar la regla de capas: confirmar que `test_layer_boundaries.py` sigue pasando y que `scan_schemas.py` no importa nada del framework web
- [x] 8.4 Ejecutar `pytest` completo y verificar que el total es el baseline de 1.1 más los tests nuevos, sin regresiones
- [x] 8.5 Verificar que `git status` muestra exactamente dos archivos tocados bajo `fastapi_bridge/` (`schemas/scan_schemas.py` modificado, `tests/test_scan_schemas.py` nuevo) y ningún otro cambio de código
- [x] 8.6 Marcar `[CHANGE-08] pydantic-scan-schemas` como hecho en `CHANGES.md` (estado y los cinco criterios de aceptación), y verificar que los cinco criterios tienen un test que los respalda
