"""Revisión antes de importar: filas con clave, desmarcar filas, elegir categoría e historial."""
import json

from backend import models
from backend.tests.test_bbva import SAMPLE


def test_preview_rows_have_keys_and_status(user_client):
    client, _ = user_client
    r = client.post("/api/transactions/import/preview", files={"file": ("bbva.csv", SAMPLE, "text/csv")})
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    assert [x["key"] for x in rows] == list(range(len(rows)))
    assert all(x["status"] == "new" for x in rows)
    # Compatibilidad: siguen las listas antiguas
    assert len(r.json()["new"]) == len(rows)


def test_import_skips_unchecked_rows_and_logs(user_client, db):
    client, uid = user_client
    r = client.post("/api/transactions/import", files={"file": ("bbva.csv", SAMPLE, "text/csv")}, data={"skip": "0"})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 2
    h = client.get("/api/transactions/import/history").json()
    assert h[0]["filename"] == "bbva.csv" and h[0]["imported"] == 2 and h[0]["source"] == "bbva"
    # La fila saltada sigue apareciendo como nueva
    rows = client.post("/api/transactions/import/preview", files={"file": ("bbva.csv", SAMPLE, "text/csv")}).json()["rows"]
    assert [x["status"] for x in rows].count("new") == 1


def test_import_applies_chosen_category(user_client, db):
    client, uid = user_client
    cat = db.query(models.Category).filter((models.Category.user_id == None) | (models.Category.user_id == uid)).first()  # noqa: E711
    r = client.post("/api/transactions/import", files={"file": ("bbva.csv", SAMPLE, "text/csv")},
                    data={"categories": json.dumps({"1": cat.id, "2": 999999})})
    assert r.status_code == 200, r.text
    txs = db.query(models.Transaction).filter(models.Transaction.user_id == uid).order_by(models.Transaction.id).all()
    assert txs[1].category_id == cat.id and txs[1].is_auto_categorized is False
    assert txs[2].category_id != 999999
