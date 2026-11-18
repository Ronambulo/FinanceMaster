import pytest

from backend.services.bank_connectors import detect_bank, parse_file
from backend.services.bank_connectors.bbva import BBVAConnector, parse_amount, parse_date, tx_type

SAMPLE = (
    "Últimos movimientos\n"
    "Cuenta;ES00 0182 0000 0000 0000 0000\n"
    "\n"
    "F.Valor;Fecha;Concepto;Movimiento;Importe;Divisa;Disponible;Divisa;Observaciones\n"
    "03/11/2026;03/11/2026;MERCADONA VALENCIA;Pago con tarjeta;-23,45;EUR;1.234,56;EUR;\n"
    "01/11/2026;01/11/2026;NOMINA EMPRESA SL;Abono de nómina;1.850,00;EUR;1.258,01;EUR;Noviembre\n"
    "31/10/2026;31/10/2026;Bizum a Ana;Transferencia;-15,00;EUR;-591,99;EUR;\n"
    ";;;;;;;;\n"
    "xx/10/2026;xx;Mala;;-1;EUR;;EUR;\n"
).encode("utf-8")


@pytest.mark.parametrize("raw,expected", [
    ("-1.234,56", -1234.56), ("12,5", 12.5), ("-12.50", -12.5), ("1.234", 1234.0),
    ("1 234,00 €", 1234.0), ("", None), ("abc", None),
])
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == expected


def test_parse_date():
    assert parse_date("03/11/2026").isoformat() == "2026-11-03"
    assert parse_date("2026-11-03").isoformat() == "2026-11-03"
    assert parse_date("nope") is None


def test_tx_type():
    assert tx_type(-5, "MERCADONA", "Pago con tarjeta") == "CARD_TRANSACTION"
    assert tx_type(-5, "Bizum a Ana", "") == "TRANSFER_OUTBOUND"
    assert tx_type(100, "NOMINA", "Abono de nómina") == "CUSTOMER_INPAYMENT"
    assert tx_type(100, "Bizum de Ana", "") == "TRANSFER_INBOUND"


def test_sniff_with_preamble():
    assert BBVAConnector.sniff(SAMPLE)
    assert not BBVAConnector.sniff(b"Date,Payee,Amount\n2026-01-01,x,1\n")


def test_parse_file_autodetects_bbva():
    res = parse_file(SAMPLE)
    assert res["detected"] == "bbva"
    rows = res["rows"]
    assert len(rows) == 3
    assert len(res["errors"]) == 1
    first = rows[0]
    assert first["amount"] == -23.45 and first["name"] == "MERCADONA VALENCIA"
    assert first["date"].isoformat() == "2026-11-03"
    assert first["external_id"].startswith("bbva_")
    assert rows[1]["type"] == "CUSTOMER_INPAYMENT"
    assert "Noviembre" in rows[1]["description"]
    # ids estables y distintos
    assert len({r["external_id"] for r in rows}) == 3
    assert parse_file(SAMPLE)["rows"][0]["external_id"] == first["external_id"]


def test_header_first_line_detects_directly():
    content = SAMPLE.split(b"\n", 3)[3]
    assert detect_bank({h for h in content.split(b"\n")[0].decode().split(";")}) == "bbva"
    assert parse_file(content, "bbva")["detected"] == "bbva"


def test_other_formats_not_hijacked():
    n26 = b'"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)"\n'
    assert parse_file(n26)["detected"] == "n26"


def test_import_endpoint_with_bbva(user_client):
    client, _ = user_client
    r = client.post("/api/transactions/import", files={"file": ("bbva.csv", SAMPLE, "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["detected_bank"] == "bbva" and r.json()["imported"] == 3
    # Reimportar no duplica
    r = client.post("/api/transactions/import", files={"file": ("bbva.csv", SAMPLE, "text/csv")})
    assert r.json()["imported"] == 0
