"""Receptor HTTP local trivial para la fase de rate limiting (CHANGE-22, D-5, 5.1).

Responde `200 {"received": true}` a **cualquier** `POST`, sin tocar disco,
red externa ni `db_fuzzing`. Se usa como valor temporal de `N8N_WEBHOOK_URL`
mientras dura `test_smoke_rate_limit.py`, para poder observar el `429` de la
solicitud 11 sin disparar 10 escaneos reales (ZAP+Nuclei+ffuf+SQLMap) contra
`localhost:8081` -- ver D-5 de `design.md` para la justificación completa.

**No es un test** -- no lleva prefijo `test_`, pytest no lo colecta. Se
levanta a mano (o desde un script del runbook) como proceso aparte:

    python fastapi_bridge/tests/e2e/local_receiver.py [--port 9999]

y se apaga con Ctrl+C. `test_smoke_rate_limit.py` no lo arranca por sí
mismo (D-3: el suite se conecta a infraestructura ya levantada, no la
orquesta) -- es responsabilidad del paso 5.2 del runbook / del operador.
"""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class _TrivialReceiverHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (nombre impuesto por BaseHTTPRequestHandler)
        content_length = int(self.headers.get("Content-Length", 0))
        # Se descarta el cuerpo: este receptor no inspecciona el payload,
        # solo confirma recepción -- suficiente para que slowapi cuente la
        # solicitud como aceptada del lado del Bridge.
        if content_length:
            self.rfile.read(content_length)
        body = b'{"received": true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        # Silencia el log por request por defecto de BaseHTTPRequestHandler
        # (va a stderr); quien lo levante ve igual el proceso vivo.
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=9999)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), _TrivialReceiverHandler)
    print(f"local_receiver: escuchando en http://{args.host}:{args.port}/ (Ctrl+C para salir)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
