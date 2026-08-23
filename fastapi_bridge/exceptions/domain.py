"""Errores de dominio del proyecto (CHANGE-03, D-1).

Un error de dominio representa una regla de negocio violada (p. ej. "el
email ya existe"), no un detalle de infraestructura (un `IntegrityError` de
SQLAlchemy, un error de conexión). Vive en un módulo propio — ni en
`exceptions/handlers.py` (que importa Starlette y slowapi: arrastrar eso a
una capa de dominio o de persistencia rompería la regla dura de capas), ni
en el módulo del repositorio que primero lo lanza (eso obligaría a la capa
web y a `AuthService` a importar desde `repositories/`, una dependencia
invertida — mismo razonamiento que D-10 de CHANGE-02 al mudar `ErrorDetail`
fuera de `scan_schemas.py`).

`DomainError` es la base común. CHANGE-04 (`InvalidCredentialsError`) y
CHANGE-11 agregan sus propias excepciones de dominio a este módulo en vez de
reabrir la discusión de dónde ubicarlas. CHANGE-07 registra un único
`exception_handler` sobre `DomainError` en `main.py`
(`domain_error_handler`, con la tabla `_DOMAIN_ERROR_MAP` declarada en
`exceptions/handlers.py`) en vez de uno por cada subclase concreta: agregar
un error de dominio nuevo es una fila en esa tabla, no un handler nuevo.
"""


class DomainError(Exception):
    """Base de todos los errores de dominio del proyecto."""


class EmailAlreadyExistsError(DomainError):
    """El email ya está registrado — RN-WS-13, mapeado a 409 Conflict por CHANGE-07.

    `UserRepository.create` la lanza al traducir el `IntegrityError` que
    produce la violación de la constraint `UNIQUE` de `email` (ver
    `repositories/user_repository.py`, D-3). Conserva el email **normalizado**
    (el valor que realmente colisionó en el motor) como atributo, que
    `domain_error_handler` (CHANGE-07) usa para componer el `detail` del
    RFC 7807 sin volver a consultar la base ni parsear el mensaje de la
    excepción.
    """

    def __init__(self, email: str) -> None:
        self.email = email
        super().__init__(f"El email '{email}' ya está registrado")


class InvalidCredentialsError(DomainError):
    """Credenciales inválidas en login — RN-WS-12 §Excepciones globales,
    mapeada a 401 Unauthorized por CHANGE-07.

    `AuthService.login` (CHANGE-04) la lanza tanto si el email no existe como
    si la contraseña no coincide — el mismo tipo, con el mismo mensaje fijo,
    para las dos condiciones. Asimetría deliberada respecto de
    `EmailAlreadyExistsError`: esta excepción **no** lleva el email como
    atributo. En un 409 por email duplicado el cliente ya sabe qué email
    mandó; en un 401 de login, el email es exactamente el dato que un
    atacante quiere ver confirmado, así que la tentación de interpolarlo en
    el `detail` del RFC 7807 se elimina en el origen: no hay dónde tomarlo.
    """

    def __init__(self) -> None:
        super().__init__("email o contraseña incorrectos")
