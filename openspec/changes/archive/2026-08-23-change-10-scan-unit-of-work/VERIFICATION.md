# VERIFICATION — CHANGE-10 `scan-unit-of-work`

Guía manual para convencerse de que `ScanUoW` funciona, sin depender de leer la
suite de tests. Todos los comandos se ejecutan desde la raíz del repo.

## 1. Ejecutar sólo los tests de este change

```
python -m pytest fastapi_bridge/tests/test_scan_unit_of_work.py -v
```

Esperado: 26 tests, todos `PASSED`.

## 2. Ejecutar la suite completa sin warnings

```
python -m pytest fastapi_bridge/tests/ -W error -v
```

Esperado: 215 tests `PASSED`, ninguna línea `warning` en la salida. Si aparece
`PytestDeprecationWarning: The configuration option "asyncio_default_fixture_loop_scope"
is unset`, revisar que `pytest.ini` tenga la línea `asyncio_default_fixture_loop_scope = function`
(agregada durante la re-verificación de este change; ver nota en `tasks.md` 8.5).

## 3. Ejercitar `ScanUoW` a mano (ciclo de vida del cliente httpx)

```
python -c "
import asyncio
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.uow.scan_unit_of_work import ScanUoW

async def main():
    settings = Settings(N8N_WEBHOOK_URL='http://n8n.manual.test/webhook', N8N_WEBHOOK_TOKEN='manual-token')
    uow = ScanUoW(settings=settings)

    async with uow as entered:
        client = entered._client
        print('is_closed dentro del ambito:', client.is_closed)   # False
        print('timeout del cliente:', client.timeout)              # Timeout(timeout=10.0)
        print('n8n es estable:', entered.n8n is entered.n8n)        # True

    print('is_closed despues de salir:', client.is_closed)          # True

asyncio.run(main())
"
```

Esperado: `is_closed dentro del ambito: False`, `timeout del cliente: Timeout(timeout=10.0)`,
`n8n es estable: True`, `is_closed despues de salir: True`.

## 4. Confirmar el `RuntimeError` fuera de vigencia

```
python -c "
import asyncio
from fastapi_bridge.uow.scan_unit_of_work import ScanUoW
from fastapi_bridge.core.settings import Settings

async def main():
    uow = ScanUoW(settings=Settings(N8N_WEBHOOK_URL='http://x.test/hook', N8N_WEBHOOK_TOKEN='t'))
    try:
        uow.n8n
        print('BUG: no levanto RuntimeError antes de __aenter__')
    except RuntimeError as e:
        print('OK antes de entrar:', e)

    async with uow:
        pass

    try:
        uow.n8n
        print('BUG: no levanto RuntimeError despues de __aexit__')
    except RuntimeError as e:
        print('OK despues de salir:', e)

asyncio.run(main())
"
```

Esperado: dos líneas `OK ...` — ninguna línea `BUG:`.

## 5. Confirmar que el cliente cierra incluso si el bloque falla

```
python -c "
import asyncio
from fastapi_bridge.uow.scan_unit_of_work import ScanUoW
from fastapi_bridge.core.settings import Settings

async def main():
    uow = ScanUoW(settings=Settings(N8N_WEBHOOK_URL='http://x.test/hook', N8N_WEBHOOK_TOKEN='t'))
    client_ref = None
    try:
        async with uow as entered:
            client_ref = entered._client
            raise ValueError('fallo deliberado dentro del ambito')
    except ValueError:
        print('excepcion original llego intacta')
    print('cliente cerrado tras la excepcion:', client_ref.is_closed)  # True

asyncio.run(main())
"
```

Esperado: `excepcion original llego intacta` seguido de `cliente cerrado tras la
excepcion: True`.

## 6. Verificar las fronteras de capa (AST, no vacuas)

```
python -m pytest fastapi_bridge/tests/test_layer_boundaries.py -v
```

Esperado: 11 tests `PASSED` (10 combinaciones `directorio/paquete-prohibido`
parametrizadas, incluidas las tres nuevas `uow/fastapi`, `uow/starlette`,
`uow/slowapi`, más `test_helper_detects_a_forbidden_import`).

## 7. Validar el change en OpenSpec

```
openspec validate --all --strict
```

Esperado: `Totals: 7 passed, 0 failed (7 items)`, incluyendo
`✓ change/change-10-scan-unit-of-work`.
