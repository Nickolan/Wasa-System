"""Tests de `fastapi_bridge.schemas.scan_schemas` (scan-payload-contract)."""

import pytest
from pydantic import ValidationError

from fastapi_bridge.schemas.scan_schemas import N8nPayload, ScanRequest, ScanResponse


def test_scan_request_accepts_https_target_url():
    request = ScanRequest(
        target_url="https://example.com/login.php", phpsessid="a1b2c3d4e5f6g7h8"
    )
    assert str(request.target_url) == "https://example.com/login.php"


def test_scan_request_accepts_http_target_url_with_query_string():
    request = ScanRequest(
        target_url="http://testphp.vulnweb.com/artists.php?artist=1",
        phpsessid="a1b2c3d4e5f6g7h8",
    )
    assert str(request.target_url) == "http://testphp.vulnweb.com/artists.php?artist=1"


def test_scan_request_rejects_target_url_without_scheme():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="example.com/login.php", phpsessid="a1b2c3d4e5f6g7h8")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("target_url",) for error in errors)


def test_scan_request_rejects_ftp_scheme():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="ftp://example.com", phpsessid="a1b2c3d4e5f6g7h8")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("target_url",) for error in errors)


def test_scan_request_rejects_file_scheme():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="file:///etc/passwd", phpsessid="a1b2c3d4e5f6g7h8")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("target_url",) for error in errors)


def test_scan_request_rejects_empty_target_url():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="", phpsessid="a1b2c3d4e5f6g7h8")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("target_url",) for error in errors)


def test_scan_request_rejects_arbitrary_text_as_target_url():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="no soy una url", phpsessid="a1b2c3d4e5f6g7h8")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("target_url",) for error in errors)


def test_scan_request_target_url_normalizes_deterministically():
    # pydantic >=2.10 normaliza HttpUrl: "https://example.com" pasa a
    # "https://example.com/" (barra final agregada al host desnudo). Ambas
    # formas de entrada deben terminar en la misma representación textual,
    # que es lo que efectivamente se reenvía al orquestador n8n.
    bare = ScanRequest(target_url="https://example.com", phpsessid="a1b2c3d4e5f6g7h8")
    slash = ScanRequest(target_url="https://example.com/", phpsessid="a1b2c3d4e5f6g7h8")
    assert str(bare.target_url) == str(slash.target_url) == "https://example.com/"


def test_scan_request_rejects_empty_phpsessid():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="https://example.com/login.php", phpsessid="")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("phpsessid",) for error in errors)


def test_scan_request_rejects_whitespace_only_phpsessid_because_strip_runs_before_min_length():
    # min_length=1 solo (sin strip_whitespace) NO habria bastado: "   " tiene
    # longitud 3 y pasaria. El strip debe ejecutarse ANTES de evaluar la
    # longitud para que este caso se rechace (D-2). No "simplificar" quitando
    # strip_whitespace de la anotacion.
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="https://example.com/login.php", phpsessid="   ")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("phpsessid",) for error in errors)


def test_scan_request_rejects_missing_phpsessid():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(target_url="https://example.com/login.php")
    errors = exc_info.value.errors()
    assert any(
        error["loc"] == ("phpsessid",) and error["type"] == "missing" for error in errors
    )


def test_scan_request_accepts_normal_phpsessid_value():
    request = ScanRequest(
        target_url="https://example.com/login.php", phpsessid="a1b2c3d4e5f6g7h8"
    )
    assert request.phpsessid == "a1b2c3d4e5f6g7h8"


def test_scan_request_strips_leading_and_trailing_whitespace_from_phpsessid():
    request = ScanRequest(
        target_url="https://example.com/login.php", phpsessid="  a1b2c3  "
    )
    assert request.phpsessid == "a1b2c3"


def test_scan_request_rejects_sqlmap_level_above_range():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_level=6,
        )
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("sqlmap_level",) for error in errors)


@pytest.mark.parametrize("level", [1, 3, 5])
def test_scan_request_accepts_valid_sqlmap_level(level):
    request = ScanRequest(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        sqlmap_level=level,
    )
    assert request.sqlmap_level == level


@pytest.mark.parametrize("level", [0, -1])
def test_scan_request_rejects_sqlmap_level_below_range(level):
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_level=level,
        )
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("sqlmap_level",) for error in errors)


def test_scan_request_sqlmap_level_defaults_to_one_when_omitted():
    request = ScanRequest(target_url="https://example.com/login.php", phpsessid="a1b2c3")
    assert request.sqlmap_level == 1


@pytest.mark.parametrize("level", ["alto", 2.5])
def test_scan_request_rejects_non_integer_sqlmap_level(level):
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_level=level,
        )
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("sqlmap_level",) for error in errors)


def test_scan_request_rejects_sqlmap_risk_above_range():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_risk=4,
        )
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("sqlmap_risk",) for error in errors)


@pytest.mark.parametrize("risk", [1, 2, 3])
def test_scan_request_accepts_valid_sqlmap_risk(risk):
    request = ScanRequest(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        sqlmap_risk=risk,
    )
    assert request.sqlmap_risk == risk


@pytest.mark.parametrize("risk", [0, -1])
def test_scan_request_rejects_sqlmap_risk_below_range(risk):
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_risk=risk,
        )
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("sqlmap_risk",) for error in errors)


def test_scan_request_sqlmap_risk_defaults_to_one_when_omitted():
    request = ScanRequest(target_url="https://example.com/login.php", phpsessid="a1b2c3")
    assert request.sqlmap_risk == 1


def test_scan_request_does_not_clamp_out_of_range_sqlmap_params():
    # D-3: el contrato RECHAZA valores fuera de rango, no los recorta.
    # El clamping (si existe) es UX del formulario, no del backend.
    with pytest.raises(ValidationError):
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_level=6,
        )
    with pytest.raises(ValidationError):
        ScanRequest(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_risk=4,
        )


def test_scan_request_minimal_valid_request_uses_sqlmap_defaults():
    request = ScanRequest(
        target_url="https://example.com/login.php", phpsessid="a1b2c3"
    )
    assert request.sqlmap_level == 1
    assert request.sqlmap_risk == 1


def test_scan_request_multiple_invalid_fields_report_all_errors():
    with pytest.raises(ValidationError) as exc_info:
        ScanRequest(
            target_url="example.com/login.php",  # sin esquema
            phpsessid="",  # vacio
            sqlmap_level=9,  # fuera de rango
        )
    locs = {error["loc"] for error in exc_info.value.errors()}
    assert ("target_url",) in locs
    assert ("phpsessid",) in locs
    assert ("sqlmap_level",) in locs


def test_scan_request_unknown_field_is_ignored_and_not_propagated():
    request = ScanRequest(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        acepta_terminos=True,
    )
    assert "acepta_terminos" not in request.model_dump()


def test_scan_request_declares_no_email_field():
    # 1.5 (CHANGE-23, D-1/RN-WS-16): `ScanRequest` NO declara ningún campo de
    # email -- el cliente no puede fijar ni influir el destinatario del
    # reporte. Ésta es una garantía a fijar por test, no una función a
    # implementar: no se modifica `ScanRequest` para que este test pase.
    assert "email" not in ScanRequest.model_fields


def test_scan_request_discards_an_email_field_sent_by_the_client():
    # 1.5: si el cliente igual manda un campo `email`, `extra="ignore"` lo
    # descarta antes de llegar al Service -- no queda ni como atributo ni en
    # `model_dump()`.
    request = ScanRequest(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        email="atacante@example.com",
    )
    assert "email" not in request.model_dump()
    assert not hasattr(request, "email")


def test_scan_response_valid_with_queued_status():
    response = ScanResponse(
        scan_id="a3f1e9d2-1234-5678-9abc-def012345678",
        status="queued",
        message="Escaneo encolado correctamente",
    )
    assert response.scan_id == "a3f1e9d2-1234-5678-9abc-def012345678"
    assert response.status == "queued"
    assert response.message == "Escaneo encolado correctamente"


@pytest.mark.parametrize("status", ["running", "failed"])
def test_scan_response_rejects_status_other_than_queued(status):
    with pytest.raises(ValidationError) as exc_info:
        ScanResponse(scan_id="scan-1", status=status, message="mensaje")
    errors = exc_info.value.errors()
    assert any(error["loc"] == ("status",) for error in errors)


def test_scan_response_missing_scan_id_is_required_error():
    with pytest.raises(ValidationError) as exc_info:
        ScanResponse(status="queued", message="mensaje")
    errors = exc_info.value.errors()
    assert any(
        error["loc"] == ("scan_id",) and error["type"] == "missing" for error in errors
    )


def test_scan_response_missing_status_is_required_error():
    with pytest.raises(ValidationError) as exc_info:
        ScanResponse(scan_id="scan-1", message="mensaje")
    errors = exc_info.value.errors()
    assert any(
        error["loc"] == ("status",) and error["type"] == "missing" for error in errors
    )


def test_scan_response_missing_message_is_required_error():
    with pytest.raises(ValidationError) as exc_info:
        ScanResponse(scan_id="scan-1", status="queued")
    errors = exc_info.value.errors()
    assert any(
        error["loc"] == ("message",) and error["type"] == "missing" for error in errors
    )


def test_n8n_payload_valid_with_all_six_fields():
    payload = N8nPayload(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        sqlmap_level=1,
        sqlmap_risk=1,
        scan_id="scan-1",
        email="usuario@test.local",
    )
    assert payload.target_url == "https://example.com/login.php"
    assert payload.phpsessid == "a1b2c3"
    assert payload.sqlmap_level == 1
    assert payload.sqlmap_risk == 1
    assert payload.scan_id == "scan-1"
    assert payload.email == "usuario@test.local"


def test_n8n_payload_missing_scan_id_is_required_error():
    with pytest.raises(ValidationError) as exc_info:
        N8nPayload(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_level=1,
            sqlmap_risk=1,
            email="usuario@test.local",
        )
    errors = exc_info.value.errors()
    assert any(
        error["loc"] == ("scan_id",) and error["type"] == "missing" for error in errors
    )


def test_n8n_payload_missing_email_is_required_error():
    # 1.3(a) TRIANGULATE: omitir `email` produce un error de campo requerido,
    # exactamente como omitir `scan_id`.
    with pytest.raises(ValidationError) as exc_info:
        N8nPayload(
            target_url="https://example.com/login.php",
            phpsessid="a1b2c3",
            sqlmap_level=1,
            sqlmap_risk=1,
            scan_id="scan-1",
        )
    errors = exc_info.value.errors()
    assert any(
        error["loc"] == ("email",) and error["type"] == "missing" for error in errors
    )


def test_n8n_payload_serializes_to_exactly_six_keys_with_plain_string_url_and_email():
    payload = N8nPayload(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        sqlmap_level=1,
        sqlmap_risk=1,
        scan_id="scan-1",
        email="usuario@test.local",
    )
    dumped = payload.model_dump(mode="json")
    assert set(dumped.keys()) == {
        "target_url",
        "phpsessid",
        "sqlmap_level",
        "sqlmap_risk",
        "scan_id",
        "email",
    }
    assert isinstance(dumped["target_url"], str)
    assert isinstance(dumped["email"], str)


def test_n8n_payload_email_travels_unchanged_without_normalization():
    # 1.3(c) TRIANGULATE: ni se recorta, ni se pasa a minúsculas, ni se
    # transforma de ninguna otra forma -- viaja tal cual llega.
    raw_email = "  Usuario.CON-Mayusculas+tag@Test.Local  "
    payload = N8nPayload(
        target_url="https://example.com/login.php",
        phpsessid="a1b2c3",
        sqlmap_level=1,
        sqlmap_risk=1,
        scan_id="scan-1",
        email=raw_email,
    )
    assert payload.email == raw_email


def test_n8n_payload_is_compatible_with_a_validated_scan_request():
    # D-5/D-6: el mapeo real vive en ScanService (CHANGE-11); acá solo se
    # verifica que ambos contratos son compatibles construyendolo a mano.
    request = ScanRequest(target_url="https://example.com/login.php", phpsessid="  a1b2c3  ")
    payload = N8nPayload(
        target_url=str(request.target_url),
        phpsessid=request.phpsessid,
        sqlmap_level=request.sqlmap_level,
        sqlmap_risk=request.sqlmap_risk,
        scan_id="scan-generado-por-el-bridge",
        email="usuario@test.local",
    )
    assert payload.target_url == str(request.target_url)
    assert payload.phpsessid == "a1b2c3"
    assert payload.sqlmap_level == 1
    assert payload.sqlmap_risk == 1
    assert payload.email == "usuario@test.local"
