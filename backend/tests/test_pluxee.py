import io

from openpyxl import Workbook

from backend.services.bank_connectors import parse_file


def _xlsx(rows):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


SHEET = [
    [None] * 6 + ["Pluxee Tarjeta Restaurante"],
    [None] * 6 + ["**** **** ****", "5838"],
    [None] * 6 + ["30,40"],
    ["HOJA DE MOVIMIENTOS", None, "2026-08-20 al 2026-11-18"],
    [],
    ["Fecha", "Descripción", "Importe"],
    ["16/11/2026", "Pago en RUNNING LA VAGUADA 3,MADRID,ESP", "-23,45"],
    ["26/09/2026", "Pago en GLOVO26SEP M8X3ZW1N,none,ESP", "-37,00"],
    ["26/09/2026", "Pago en GLOVO26SEP M8X3ZW1N,none,ESP", "-37,00"],
    ["18/09/2026", "Carga de ORANGE ESPAGNE S.A.U.", "127,85"],
    [None, "IMPORTE", "30,40"],
]


def test_pluxee_excel_is_detected_and_parsed():
    r = parse_file(_xlsx(SHEET))
    assert r["detected"] == "pluxee"
    assert r["errors"] == []
    rows = r["rows"]
    assert len(rows) == 4  # la fila de total se ignora
    assert rows[0]["name"] == "RUNNING LA VAGUADA 3"
    assert rows[0]["description"] == "MADRID"
    assert rows[0]["type"] == "CARD_TRANSACTION"
    assert rows[1]["description"] is None  # "none" no es un lugar
    # Dos pagos idénticos el mismo día no se toman por duplicados
    assert rows[1]["external_id"] != rows[2]["external_id"]
    top = rows[3]
    assert top["type"] == "TRANSFER_INBOUND"  # no es nómina
    assert top["counterparty_name"] == "ORANGE ESPAGNE S.A.U."
    assert round(sum(x["amount"] for x in rows), 2) == 30.40


def test_pluxee_ids_are_stable_between_exports():
    a = parse_file(_xlsx(SHEET))["rows"]
    b = parse_file(_xlsx(SHEET[:6] + SHEET[7:]))["rows"]
    assert {x["external_id"] for x in b} <= {x["external_id"] for x in a}


def test_pluxee_forced_format_from_csv():
    text = "Pluxee Tarjeta Restaurante\nFecha;Descripción;Importe\n01/11/2026;Pago en BAR,MADRID,ESP;-5,00\n"
    r = parse_file(text.encode("utf-8"), "pluxee")
    assert r["detected"] == "pluxee"
    assert r["rows"][0]["amount"] == -5.0
